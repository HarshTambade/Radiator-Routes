import { retiredHandler } from "../_shared/retired.ts";

Deno.serve(retiredHandler("travel-memory", "The current app reads traveler preferences through Supabase Row-Level Security."));
