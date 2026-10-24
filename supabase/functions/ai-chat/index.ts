import { retiredHandler } from "../_shared/retired.ts";

Deno.serve(retiredHandler("ai-chat", "Use the authenticated groq-proxy for hosted chat."));
