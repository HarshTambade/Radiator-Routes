// ─────────────────────────────────────────────────────────────────────────────
// Supabase client
// ─────────────────────────────────────────────────────────────────────────────
// Credentials come exclusively from environment variables. Nothing is
// hardcoded, so rotating a key or pointing at a different project is a
// config change with no code edit.
//
// Required in .env (see .env.example):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_PUBLISHABLE_KEY   (or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as
    | string
    | undefined);

/** True when Supabase is configured — lets features degrade instead of crash. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  const missing = [
    !url && "VITE_SUPABASE_URL",
    !anonKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]
    .filter(Boolean)
    .join(", ");

  // Fail loudly in dev so the misconfiguration is obvious immediately.
  if (import.meta.env.DEV) {
    throw new Error(
      `[supabase] Missing required environment variable(s): ${missing}. ` +
        `Copy .env.example to .env and fill them in.`,
    );
  }
  console.error(
    `[supabase] Missing ${missing}. Auth, trips and realtime features are disabled.`,
  );
}

export const supabase = createClient<Database>(
  url ?? "http://localhost:54321",
  anonKey ?? "missing-anon-key",
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
    global: {
      headers: { "x-client-info": "radiator-routes" },
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  },
);
