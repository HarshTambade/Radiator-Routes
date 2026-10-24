import { retiredHandler } from "../_shared/retired.ts";

Deno.serve(retiredHandler("tomtom", "Use openroute for routing and the current free traffic fallbacks."));
