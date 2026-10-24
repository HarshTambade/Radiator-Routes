import { supabase } from "@/integrations/supabase/client";

type GroqTask = "chat" | "vision";

/**
 * Call the authenticated server proxy. Provider credentials live only in
 * Supabase Edge Function secrets and never enter the browser bundle.
 */
export async function groqProxyFetch(
  endpoint: "chat/completions" | "audio/transcriptions",
  init: RequestInit,
  task: GroqTask = "chat",
): Promise<Response> {
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
  const publishableKey = (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined)
  )?.trim();
  if (!baseUrl || !publishableKey) throw new Error("BACKEND_UNAVAILABLE");

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("NO_SESSION");

  const headers = new Headers(init.headers);
  headers.set("apikey", publishableKey);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  headers.set("x-ai-task", task);
  headers.set("x-client-info", "radiator-routes");

  return fetch(`${baseUrl}/functions/v1/groq-proxy/${endpoint}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
