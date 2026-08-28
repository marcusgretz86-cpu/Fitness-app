/**
 * Bridges Apple HealthKit (iOS) and Health Connect (Android) into this
 * app's existing data shapes, via @capgo/capacitor-health -- the one
 * Capacitor health plugin that speaks to both platforms through a single
 * API, which is what makes this a genuine "one bridge, many devices" setup:
 * anything that already syncs into Apple Health or Health Connect (Garmin,
 * Renpho, Whoop, Oura, Fitbit, and others) comes through this same code
 * path, without a separate paid integration per device.
 *
 * IMPORTANT HONESTY NOTE, read before relying on this file:
 * I was not able to test this against a real device or a real Xcode/Android
 * build in the environment I wrote it in -- there's no way to run a native
 * iOS/Android build there. The plugin's core methods (isAvailable,
 * requestAuthorization, queryAggregated) are documented and stable as of
 * writing, and this file is built against that documentation. But some of
 * the exact field names for less common data types (sleep stages, workout
 * fields) may have shifted by the time you build this -- if something
 * throws on a field name, check the current docs at
 * https://capgo.app/docs/plugins/health/ against this file rather than
 * assuming the logic itself is wrong.
 *
 * WHAT THIS DOES NOT DO: HealthKit/Health Connect have no concept of
 * "recovery score" or "strain score" -- those are proprietary composite
 * metrics specific to platforms like Whoop. This file only maps real,
 * directly-available values (HRV, resting heart rate, sleep duration,
 * weight, body fat %, workouts). It does not invent a recovery/strain
 * number to fill those fields -- they're left blank rather than faked.
 */

import { Capacitor } from "@capacitor/core";

let HealthModule = null;
async function getHealth() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!HealthModule) {
    // dynamic import so the web build never even tries to load native-only code
    const mod = await import("@capgo/capacitor-health");
    HealthModule = mod.Health;
  }
  return HealthModule;
}

export async function isHealthAvailable() {
  const Health = await getHealth();
  if (!Health) return false;
  try {
    const { available } = await Health.isAvailable();
    return Boolean(available);
  } catch (e) {
    console.error("[healthkit] isAvailable failed:", e);
    return false;
  }
}

const READ_TYPES = [
  "weight",
  "bodyFatPercentage",
  "leanBodyMass",
  "heartRate",
  "restingHeartRate",
  "heartRateVariability",
  "sleep",
  "steps",
  "distance",
  "calories",
  "workouts",
];

export async function requestHealthPermissions() {
  const Health = await getHealth();
  if (!Health) return { granted: false, reason: "Not running as a native app" };
  try {
    await Health.requestAuthorization({ read: READ_TYPES, write: [] });
    return { granted: true };
  } catch (e) {
    console.error("[healthkit] requestAuthorization failed:", e);
    return { granted: false, reason: e && e.message ? e.message : String(e) };
  }
}

/**
 * Latest body composition reading -- shaped to drop straight into this
 * app's existing "Log scan" flow (see LabsTab -> submitScan in App.jsx),
 * the same shape the Renpho fallback script in /api/renpho-latest.py uses.
 */
export async function fetchLatestBodyComposition() {
  const Health = await getHealth();
  if (!Health) return null;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 14); // look back 2 weeks for the latest reading

  const result = { weight: null, bodyFat: null, skeletalMuscleMass: null, measuredAt: null };

  try {
    const { samples } = await Health.queryAggregated({
      dataType: "weight",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      bucket: "day",
      aggregation: "average",
    });
    if (samples && samples.length) {
      const latest = samples[samples.length - 1];
      result.weight = latest.value;
      result.measuredAt = latest.startDate;
    }
  } catch (e) {
    console.error("[healthkit] weight query failed:", e);
  }

  // Body fat % and lean body mass don't support aggregation per the plugin
  // docs -- use readSamples for a raw list and take the most recent entry.
  try {
    if (typeof Health.readSamples === "function") {
      const { samples: fatSamples } = await Health.readSamples({
        dataType: "bodyFatPercentage",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1,
      });
      if (fatSamples && fatSamples.length) result.bodyFat = fatSamples[fatSamples.length - 1].value;

      const { samples: leanSamples } = await Health.readSamples({
        dataType: "leanBodyMass",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 1,
      });
      if (leanSamples && leanSamples.length) result.skeletalMuscleMass = leanSamples[leanSamples.length - 1].value;
    }
  } catch (e) {
    console.error("[healthkit] body fat / lean mass query failed:", e);
  }

  if (result.weight == null && result.bodyFat == null && result.skeletalMuscleMass == null) return null;
  return result;
}

/**
 * Recent workouts, shaped to drop into this app's workout log (see
 * addWorkout in App.jsx). Duration is minutes; calories is estimated kcal.
 */
export async function fetchRecentWorkouts(days = 14) {
  const Health = await getHealth();
  if (!Health) return [];

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  try {
    const result = await Health.queryWorkouts({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    const workouts = (result && result.workouts) || [];
    return workouts.map((w) => ({
      name: w.workoutType || w.name || "Workout",
      type: mapWorkoutType(w.workoutType || w.name),
      duration: w.duration ? Math.round(w.duration / 60) : 0, // seconds -> minutes
      calories: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : 0,
      loggedAt: w.startDate || w.startTime || new Date().toISOString(),
      source: "healthkit",
    }));
  } catch (e) {
    console.error("[healthkit] queryWorkouts failed:", e);
    return [];
  }
}

function mapWorkoutType(raw) {
  const s = (raw || "").toLowerCase();
  if (s.includes("run") || s.includes("cycl") || s.includes("swim") || s.includes("row") || s.includes("cardio")) return "Cardio";
  if (s.includes("strength") || s.includes("weight") || s.includes("traditional")) return "Strength";
  if (s.includes("yoga") || s.includes("stretch") || s.includes("mobility")) return "Mobility";
  return "Sport";
}

/**
 * Recent daily vitals (HRV, resting heart rate, sleep hours) shaped for
 * this app's dailyVitals dataset (used by the Overall tab and Calendar).
 * Recovery % and Strain are intentionally left out -- see the note at the
 * top of this file for why.
 */
export async function fetchRecentVitals(days = 14) {
  const Health = await getHealth();
  if (!Health) return [];

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const byDate = {};

  try {
    const { samples } = await Health.queryAggregated({
      dataType: "restingHeartRate",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      bucket: "day",
      aggregation: "average",
    });
    (samples || []).forEach((s) => {
      const d = s.startDate.slice(0, 10);
      byDate[d] = byDate[d] || {};
      byDate[d].restingHeartRate = Math.round(s.value);
    });
  } catch (e) {
    console.error("[healthkit] resting heart rate query failed:", e);
  }

  try {
    if (typeof Health.readSamples === "function") {
      const { samples } = await Health.readSamples({
        dataType: "heartRateVariability",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 0,
      });
      (samples || []).forEach((s) => {
        const d = s.startDate.slice(0, 10);
        byDate[d] = byDate[d] || {};
        byDate[d].hrv = Math.round(s.value);
      });
    }
  } catch (e) {
    console.error("[healthkit] HRV query failed:", e);
  }

  try {
    if (typeof Health.readSamples === "function") {
      const { samples } = await Health.readSamples({
        dataType: "sleep",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 0,
      });
      (samples || []).forEach((s) => {
        const d = s.startDate.slice(0, 10);
        const hours = s.durationSeconds ? s.durationSeconds / 3600 : (s.value || 0);
        byDate[d] = byDate[d] || {};
        byDate[d].sleep = Math.round(hours * 10) / 10;
      });
    }
  } catch (e) {
    console.error("[healthkit] sleep query failed:", e);
  }

  return Object.entries(byDate).map(([date, v]) => ({
    loggedAt: new Date(date).toISOString(),
    hrv: v.hrv ?? null,
    sleep: v.sleep ?? null,
    restingHeartRate: v.restingHeartRate ?? null,
    recovery: null, // not a real HealthKit/Health Connect metric -- see file header
    strain: null,   // not a real HealthKit/Health Connect metric -- see file header
  }));
}
