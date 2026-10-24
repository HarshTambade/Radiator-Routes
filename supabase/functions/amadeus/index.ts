import { retiredHandler } from "../_shared/retired.ts";

Deno.serve(retiredHandler("amadeus", "The current app uses local flight estimates and booking links."));
