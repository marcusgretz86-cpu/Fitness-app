import { useState, useEffect, useRef } from "react";
import { getAuthToken } from "../lib/netlifyAuth.js";
import { useAuth } from "../context/AuthContext.jsx";

async function callAppStateFn(method, params) {
  const token = getAuthToken();
  if (!token) return { error: new Error("Not signed in") };
  try {
    const res = method === "GET"
      ? await fetch(`/api/app-state?key=${encodeURIComponent(params.key)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      : await fetch(`/api/app-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(params),
        });
    const data = await res.json();
    if (!res.ok) return { error: new Error(data.error || `Request failed (${res.status})`) };
    return { data };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Same (key, initialValue) -> [value, setValue] shape the app has used all
 * along -- first localStorage, then Supabase, now Netlify Database via the
 * app-state serverless function. Falls back to local-only storage if nobody
 * is signed in or the function call fails, same offline-safe pattern as
 * before.
 */
export function useNetlifyState(key, initialValue) {
  const { user } = useAuth();
  const userId = user ? user.id : null;
  const localKey = userId ? `${key}::${userId}` : key;

  const [state, setState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(localKey);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch (e) {
      return initialValue;
    }
  });

  const loadedFor = useRef(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(localKey);
      setState(stored !== null ? JSON.parse(stored) : initialValue);
    } catch (e) {
      setState(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey]);

  useEffect(() => {
    if (!userId || loadedFor.current === userId) return;
    loadedFor.current = userId;

    let cancelled = false;
    (async () => {
      const { data, error } = await callAppStateFn("GET", { key });
      if (cancelled) return;
      if (error) {
        console.error(`[useNetlifyState] read failed for "${key}":`, error.message);
        return;
      }
      if (data && data.value !== null && data.value !== undefined) {
        setState(data.value);
        try { window.localStorage.setItem(localKey, JSON.stringify(data.value)); } catch (e) {}
      } else {
        // nothing saved yet for this key/user -- seed it with current state
        callAppStateFn("POST", { key, value: state });
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(localKey, JSON.stringify(state));
    } catch (e) {}

    if (!userId) return;
    callAppStateFn("POST", { key, value: state }).then(({ error }) => {
      if (error) console.error(`[useNetlifyState] write failed for "${key}":`, error.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state, userId]);

  return [state, setState];
}
