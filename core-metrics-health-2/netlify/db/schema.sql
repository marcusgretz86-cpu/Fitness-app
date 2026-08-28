-- Core Metrics Health -- schema for Netlify Database (Postgres via Neon)
--
-- IMPORTANT DIFFERENCE FROM THE EARLIER SUPABASE VERSION OF THIS FILE:
-- Supabase's version of this table used Postgres Row Level Security tied
-- to auth.uid(), so the DATABASE ITSELF refused any query for a row that
-- didn't belong to the requesting user -- that held even if the app's own
-- code had a bug. Netlify Database has no built-in equivalent binding to
-- Netlify Identity, so there is no RLS policy below. Instead, every query
-- is manually scoped by user_id inside netlify/functions/app-state.js --
-- see the long comment at the top of that file. That is a real, meaningful
-- difference in the security guarantee (enforced by a human writing correct
-- code, not enforced by the database), not just a syntax change.
--
-- Run this once via the SQL runner in your Netlify Database dashboard
-- (Site configuration -> Database -> query/SQL tool) after provisioning
-- the database.

create table if not exists app_state (
  user_id text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists app_state_user_id_idx on app_state (user_id);
