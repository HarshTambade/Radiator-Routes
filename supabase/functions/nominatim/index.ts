import { retiredHandler } from "../_shared/retired.ts";

Deno.serve(retiredHandler("nominatim", "Use the current client-side Nominatim service."));
