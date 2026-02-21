// Supabase client — Radiator Routes
// Project: dfvyuqxyjlkoovxmtikq
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// ── New project credentials (authoritative defaults) ─────────────────────────
const NEW_SUPABASE_URL = "https://dfvyuqxyjlkoovxmtikq.supabase.co";
const NEW_SUPABASE_KEY = "sb_publishable_Y3N5QRELKbHRYqWNZbx3EA_MVvHDzwF";
const OLD_SUPABASE_URL = "https://zsamypacycdvrhegcqvk.supabase.co";

// Prefer the new-name env var, then fall back to the old-name env var.
// But if the URL still points at the old project, override with the new credentials
// so the app works correctly even before the .env file is updated.
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as
    | string
    | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

// If the env URL still targets the old project, ignore both env values and use
// the hardcoded new-project credentials instead.
const isOldProject = envUrl === OLD_SUPABASE_URL || !envUrl;

const SUPABASE_URL = isOldProject
  ? NEW_SUPABASE_URL
  : (envUrl ?? NEW_SUPABASE_URL);
const SUPABASE_PUBLISHABLE_KEY = isOldProject
  ? NEW_SUPABASE_KEY
  : (envKey ?? NEW_SUPABASE_KEY);

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
