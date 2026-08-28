"""
Pulls the latest reading from your Renpho scale using the unofficial
`renpho-api` community library (reverse-engineered, not sanctioned by
Renpho — see the note in README.md before relying on this).

Requires two environment variables, set in your Vercel project settings
(Settings -> Environment Variables), NEVER committed to git or exposed
to the browser:

  RENPHO_EMAIL     the email you log into the Renpho app with
  RENPHO_PASSWORD  the password you log into the Renpho app with

Returns the most recent measurement in a shape that maps directly onto
this app's "Log scan" fields (see src/App.jsx, LabsTab -> submitScan).
"""

from http.server import BaseHTTPRequestHandler
import json
import os


def find_first(d, keys):
    """Renpho's field names vary a bit by scale model / library version,
    so check a handful of likely spellings rather than assuming one."""
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def map_measurement(m):
    return {
        "weight": find_first(m, ["weight_kg", "weight", "weightKg"]),
        "bmi": find_first(m, ["bmi"]),
        "skeletalMuscleMass": find_first(m, ["muscle_mass", "skeletal_muscle_mass", "muscleMass"]),
        "bodyFat": find_first(m, ["body_fat", "body_fat_percentage", "bodyFatPercentage", "fat_percentage"]),
        "visceralFat": find_first(m, ["visceral_fat", "visceral_fat_rating", "visceralFat"]),
        "bodyWater": find_first(m, ["water_percentage", "body_water", "bodyWaterPercentage"]),
        "measuredAt": find_first(m, ["time_stamp", "timestamp", "measured_at", "createdAt"]),
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        email = os.environ.get("RENPHO_EMAIL")
        password = os.environ.get("RENPHO_PASSWORD")

        if not email or not password:
            self._send(500, {"error": "RENPHO_EMAIL / RENPHO_PASSWORD are not set on the server."})
            return

        try:
            from renpho import RenphoClient
        except ImportError:
            self._send(500, {"error": "renpho-api package not installed. Check requirements.txt in /api."})
            return

        try:
            client = RenphoClient(email, password)
            client.login()

            device_info = client.get_device_info()
            scales = device_info.get("scale", [])
            if not scales:
                self._send(404, {"error": "No Renpho scale found on this account."})
                return

            # Body-composition scales expose more fields than weight-only ones;
            # fall back to plain weight measurements if that endpoint is empty.
            measurements = client.get_body_composition_measurements() or client.get_measurements()
            if not measurements:
                self._send(404, {"error": "No measurements found yet — weigh in once via the Renpho app first."})
                return

            latest = measurements[0]
            self._send(200, map_measurement(latest))
        except Exception as e:
            self._send(502, {"error": f"Could not reach Renpho: {str(e)}"})

    def _send(self, status, payload):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
