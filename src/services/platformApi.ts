import { supabase } from "@/integrations/supabase/client";

export const PLATFORM_API_SCOPES = [
  { id: "trips:read", label: "Read trips", detail: "List trips and read individual trip details." },
  { id: "trips:write", label: "Create trips", detail: "Create new trips for your account." },
  { id: "budget:read", label: "Read budgets", detail: "Read expense totals and remaining budget." },
  { id: "plans:generate", label: "Generate plans", detail: "Generate and save AI itineraries." },
  { id: "orders:read", label: "Read booking requests", detail: "List booking request records created by this key owner." },
  { id: "orders:write", label: "Create booking requests", detail: "Record a request; does not place or pay for a booking." },
] as const;

export type PlatformApiScope = (typeof PLATFORM_API_SCOPES)[number]["id"];

export interface PlatformApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: PlatformApiScope[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface CreatedPlatformApiKey {
  key: PlatformApiKey;
  /** The raw credential is returned only once. */
  secret: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("platform-api", { body });
  if (error) throw new Error(error.message || "The API management request failed.");
  if (!data) throw new Error("The API management service returned an empty response.");
  return data as T;
}

export async function listPlatformApiKeys(): Promise<PlatformApiKey[]> {
  const result = await invoke<{ keys: PlatformApiKey[] }>({ action: "list_keys" });
  return result.keys;
}

export async function createPlatformApiKey(input: {
  name: string;
  scopes: PlatformApiScope[];
  expiresInDays: number | null;
}): Promise<CreatedPlatformApiKey> {
  return invoke<CreatedPlatformApiKey>({
    action: "create_key",
    name: input.name,
    scopes: input.scopes,
    expires_in_days: input.expiresInDays,
  });
}

export async function revokePlatformApiKey(keyId: string): Promise<void> {
  await invoke<{ revoked: boolean }>({ action: "revoke_key", key_id: keyId });
}

export function platformApiUrls() {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
  if (!base) throw new Error("VITE_SUPABASE_URL is not configured.");
  return {
    rest: `${base}/functions/v1/platform-api/v1`,
    mcp: `${base}/functions/v1/platform-api/mcp`,
    openApi: `${base}/functions/v1/platform-api/v1/openapi.json`,
  };
}

export async function checkPlatformApiHealth(): Promise<boolean> {
  try {
    const { rest } = platformApiUrls();
    const key = supabasePublishableKey();
    const response = await fetch(`${rest.replace(/\/v1$/, "")}/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function supabasePublishableKey() {
  return (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined) ??
    "YOUR_SUPABASE_PUBLISHABLE_KEY"
  );
}
