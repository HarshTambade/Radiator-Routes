import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type ProviderName = "groq" | "ors" | "opentripmap";
export type ProviderRateHeaders = Record<string, string>;

export class ProviderAuthError extends Error {
  constructor(readonly status: number, message: string, readonly headers: ProviderRateHeaders = {}) {
    super(message);
  }
}

export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ProviderAuthError(415, "Content-Type must be application/json.");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new ProviderAuthError(400, "Content-Length is invalid.");
    }
    if (length > maxBytes) throw new ProviderAuthError(413, "Request body is too large.");
  }
  if (!request.body) throw new ProviderAuthError(400, "A JSON object body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ProviderAuthError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ProviderAuthError(400, "A valid JSON object body is required.");
  }
}

export async function readProviderJson(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new ProviderAuthError(502, "The provider returned an invalid response.");
    }
    if (length > maxBytes) {
      await response.body?.cancel();
      throw new ProviderAuthError(502, "The provider response was too large.");
    }
  }
  if (!response.body) throw new ProviderAuthError(502, "The provider returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ProviderAuthError(502, "The provider response was too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    throw new ProviderAuthError(502, "The provider returned an invalid response.");
  }
}

const LIMITS: Record<ProviderName, { userMinute: number; userDay: number; projectMinute: number; projectDay: number }> = {
  groq: { userMinute: 30, userDay: 1_000, projectMinute: 90, projectDay: 5_000 },
  ors: { userMinute: 60, userDay: 300, projectMinute: 120, projectDay: 1_800 },
  opentripmap: { userMinute: 60, userDay: 200, projectMinute: 120, projectDay: 900 },
};

function bearerToken(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

export async function requireProviderUser(
  request: Request,
  provider: ProviderName,
): Promise<{ userId: string; rateHeaders: ProviderRateHeaders }> {
  const token = bearerToken(request);
  if (!token) throw new ProviderAuthError(401, "Sign in to use this integration.");

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    throw new ProviderAuthError(503, "The integration service is not configured.");
  }

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new ProviderAuthError(401, "Your session is invalid or expired.");

  const serviceClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const limits = LIMITS[provider];
  const minute = await serviceClient.rpc("consume_provider_request_rate_limit", {
    p_user_id: data.user.id,
    p_provider: provider,
    p_bucket: "minute",
    p_user_limit: limits.userMinute,
    p_project_limit: limits.projectMinute,
  }).maybeSingle();
  if (minute.error || !minute.data) throw new ProviderAuthError(503, "Provider throttling is unavailable.");
  const minuteHeaders = {
    "X-RateLimit-Remaining-Minute": String(minute.data.remaining),
    "X-RateLimit-Reset-Minute": String(Math.ceil(Date.parse(minute.data.resets_at) / 1000)),
  };
  if (!minute.data.allowed) {
    throw new ProviderAuthError(429, `The ${provider} per-minute request limit has been reached.`, minuteHeaders);
  }

  const daily = await serviceClient.rpc("consume_provider_request_rate_limit", {
    p_user_id: data.user.id,
    p_provider: provider,
    p_bucket: "day",
    p_user_limit: limits.userDay,
    p_project_limit: limits.projectDay,
  }).maybeSingle();
  if (daily.error || !daily.data) throw new ProviderAuthError(503, "Provider throttling is unavailable.");
  const rateHeaders = {
    "X-RateLimit-Remaining-Minute": String(minute.data.remaining),
    "X-RateLimit-Reset-Minute": String(Math.ceil(Date.parse(minute.data.resets_at) / 1000)),
    "X-RateLimit-Remaining-Day": String(daily.data.remaining),
    "X-RateLimit-Reset-Day": String(Math.ceil(Date.parse(daily.data.resets_at) / 1000)),
  };
  if (!daily.data.allowed) {
    throw new ProviderAuthError(429, `The ${provider} daily request quota has been reached.`, rateHeaders);
  }

  return { userId: data.user.id, rateHeaders };
}
