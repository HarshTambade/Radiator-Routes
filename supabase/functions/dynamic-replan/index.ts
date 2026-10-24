import { retiredHandler } from "../_shared/retired.ts";

Deno.serve(retiredHandler("dynamic-replan", "The current app runs forecast-aware replanning through the authenticated groq-proxy."));
