// netlify/functions/app-state.js
//
// GET  /.netlify/functions/app-state?key=cmh_workouts   -> { value }
// POST /.netlify/functions/app-state  { key, value }    -> { ok: true }
//
// SECURITY NOTE -- read this before relying on it:
// Supabase enforced "you can only touch your own rows" at the database
// level (Row Level Security), so even a bug in frontend code couldn't leak
// data between accounts. Netlify Database doesn't have an equivalent
// automatic binding to Netlify Identity, so THIS FUNCTION is the entire
// security boundary now -- every query below is manually scoped by
// user_id, and that discipline has to be maintained by anyone who touches
// this file later. If a future edit ever queries app_state without a
// "where user_id = $1" clause, that's a real data leak between accounts,
// not a theoretical one. This is a materially different (weaker, because
// it depends on humans getting every query right) guarantee than what the
// Supabase version had, and that trade-off should be a deliberate choice,
// not an accident.
//
// Netlify Functions automatically verify the Netlify Identity JWT sent in
// the Authorization header and populate context.clientContext.user for you
// -- that part IS handled safely by the platform. What's on us is making
// sure every database query after that point actually filters by that
// user's id.

import { neon } from "@neondatabase/serverless";

// NETLIFY_DATABASE_URL is set automatically once you provision Netlify
// Database from your site's dashboard -- I'm fairly confident that's the
// right env var name based on how Netlify's Neon integration works, but
// double-check it against your own dashboard (Site configuration ->
// Environment variables) once you provision the database, since this is a
// newer product and exact naming is the kind of detail that can shift.
const sql = neon(process.env.NETLIFY_DATABASE_URL);

export default async (req, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }
  const userId = user.sub; // Netlify Identity's stable user id

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const key = url.searchParams.get("key");
      if (!key) return new Response(JSON.stringify({ error: "Missing key" }), { status: 400 });

      const rows = await sql`
        select value from app_state where user_id = ${userId} and key = ${key} limit 1
      `;
      return new Response(JSON.stringify({ value: rows.length ? rows[0].value : null }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { key, value } = body;
      if (!key) return new Response(JSON.stringify({ error: "Missing key" }), { status: 400 });

      await sql`
        insert into app_state (user_id, key, value, updated_at)
        values (${userId}, ${key}, ${JSON.stringify(value)}, now())
        on conflict (user_id, key)
        do update set value = ${JSON.stringify(value)}, updated_at = now()
      `;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  } catch (e) {
    console.error("[app-state function] error:", e);
    return new Response(JSON.stringify({ error: e.message || "Server error" }), { status: 500 });
  }
};

export const config = { path: "/api/app-state" };
