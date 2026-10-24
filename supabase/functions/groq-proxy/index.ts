import { ProviderAuthError, requireProviderUser } from "../_shared/providerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-ai-task",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-RateLimit-Remaining-Minute, X-RateLimit-Reset-Minute, X-RateLimit-Remaining-Day, X-RateLimit-Reset-Day",
};

const CHAT_MAX_BYTES = 6 * 1024 * 1024;
const AUDIO_MAX_BYTES = 20 * 1024 * 1024;

function jsonResponse(data: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function requestError(status: number, message: string, headers: Record<string, string> = {}) {
  return jsonResponse({ error: { message } }, status, headers);
}

async function readBoundedBytes(request: Request, maximum: number): Promise<Uint8Array> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const declared = Number(lengthHeader);
    if (!Number.isSafeInteger(declared) || declared < 0) throw new ProviderAuthError(400, "Content-Length is invalid.");
    if (declared > maximum) throw new ProviderAuthError(413, "Request body is too large.");
  }
  if (!request.body) throw new ProviderAuthError(400, "Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new ProviderAuthError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function validateMessages(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false;
  return value.every((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const item = message as Record<string, unknown>;
    if (!(["system", "user", "assistant"].includes(String(item.role)))) return false;
    if (typeof item.content === "string") return item.content.length <= CHAT_MAX_BYTES;
    return Array.isArray(item.content) && item.content.length > 0 && item.content.length <= 40;
  });
}

function normalizeMessages(value: unknown, task: "chat" | "vision"): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const messages: Array<Record<string, unknown>> = [];
  let textCharacters = 0;
  let imageCount = 0;
  for (const message of value) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    const item = message as Record<string, unknown>;
    if (!( ["system", "user", "assistant"].includes(String(item.role)))) return null;
    if (typeof item.content === "string") {
      textCharacters += item.content.length;
      if (textCharacters > 120_000) return null;
      messages.push({ role: item.role, content: item.content });
      continue;
    }
    if (!Array.isArray(item.content) || item.content.length < 1 || item.content.length > 40) return null;
    const content: Array<Record<string, unknown>> = [];
    for (const part of item.content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) return null;
      const block = part as Record<string, unknown>;
      if (block.type === "text" && typeof block.text === "string") {
        textCharacters += block.text.length;
        if (textCharacters > 120_000) return null;
        content.push({ type: "text", text: block.text });
        continue;
      }
      if (block.type !== "image_url" || item.role !== "user" || task !== "vision") return null;
      const image = block.image_url;
      if (!image || typeof image !== "object" || Array.isArray(image)) return null;
      const imageUrl = (image as Record<string, unknown>).url;
      if (typeof imageUrl !== "string" || imageUrl.length > 5 * 1024 * 1024
        || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageUrl)) return null;
      imageCount += 1;
      if (imageCount > 3) return null;
      const detail = (image as Record<string, unknown>).detail;
      content.push({ type: "image_url", image_url: { url: imageUrl, ...(detail === "low" || detail === "high" || detail === "auto" ? { detail } : {}) } });
    }
    messages.push({ role: item.role, content });
  }
  return messages;
}

async function proxyChat(request: Request, headers: Record<string, string>) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return requestError(415, "Content-Type must be application/json.", headers);
  }
  const rawBytes = await readBoundedBytes(request, CHAT_MAX_BYTES);
  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    input = parsed as Record<string, unknown>;
  } catch {
    return requestError(400, "A valid JSON object body is required.", headers);
  }

  if (!validateMessages(input.messages)) return requestError(400, "messages must contain 1 to 50 valid chat messages.", headers);
  const task = request.headers.get("x-ai-task") === "vision" ? "vision" : "chat";
  const messages = normalizeMessages(input.messages, task);
  if (!messages) return requestError(400, "messages must contain supported chat content within the request limits.", headers);
  const temperature = input.temperature === undefined ? 0.7 : input.temperature;
  const maxTokens = input.max_tokens === undefined ? 2048 : input.max_tokens;
  if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return requestError(400, "temperature must be from 0 to 2.", headers);
  }
  if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
    return requestError(400, "max_tokens must be an integer from 1 to 8192.", headers);
  }
  if (input.stream !== undefined && typeof input.stream !== "boolean") return requestError(400, "stream must be a boolean.", headers);
  if (input.response_format !== undefined) {
    const format = input.response_format as Record<string, unknown>;
    if (!format || typeof format !== "object" || format.type !== "json_object") {
      return requestError(400, "response_format is not supported.", headers);
    }
  }

  const configuredModel = task === "vision"
    ? Deno.env.get("GROQ_VISION_MODEL")
    : Deno.env.get("GROQ_MODEL");
  const model = (configuredModel?.trim() || (task === "vision" ? "qwen/qwen3.8-27b" : "openai/gpt-oss-120b"));
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
    stream: input.stream === true,
  };
  if (input.response_format !== undefined) payload.response_format = { type: "json_object" };
  if (typeof input.top_p === "number" && Number.isFinite(input.top_p) && input.top_p > 0 && input.top_p <= 1) payload.top_p = input.top_p;
  if (typeof input.stop === "string" && input.stop.length <= 64) payload.stop = input.stop;
  else if (Array.isArray(input.stop) && input.stop.length <= 4 && input.stop.every((s) => typeof s === "string" && s.length <= 64)) payload.stop = input.stop;
  if (model.startsWith("openai/gpt-oss")) {
    payload.reasoning_effort = "low";
    payload.include_reasoning = false;
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return requestError(503, "Hosted AI is not configured.", headers);
  const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: input.stream === true ? "text/event-stream" : "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55_000),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      ...headers,
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}

async function proxyAudio(request: Request, headers: Record<string, string>) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data; boundary=")) {
    return requestError(415, "Audio transcription requires multipart/form-data.", headers);
  }
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return requestError(503, "Hosted AI is not configured.", headers);
  const body = await readBoundedBytes(request, AUDIO_MAX_BYTES);
  const upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": contentType, Accept: "text/plain, application/json" },
    body,
    signal: AbortSignal.timeout(55_000),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      ...headers,
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return requestError(405, "Only POST requests are supported.");

  let rateHeaders: Record<string, string> = {};
  try {
    const principal = await requireProviderUser(request, "groq");
    rateHeaders = principal.rateHeaders;
    const route = new URL(request.url).pathname.split("/").filter(Boolean).slice(-2).join("/");
    if (route === "chat/completions") return await proxyChat(request, rateHeaders);
    if (route === "audio/transcriptions") return await proxyAudio(request, rateHeaders);
    return requestError(404, "Unknown AI provider route.", rateHeaders);
  } catch (error) {
    const status = error instanceof ProviderAuthError ? error.status : error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502;
    const headers = error instanceof ProviderAuthError ? error.headers : rateHeaders;
    if (status >= 500) console.error("Groq proxy failed", error instanceof Error ? error.name : "unknown_error");
    const message = error instanceof ProviderAuthError
      ? error.message
      : status === 504
        ? "The hosted AI request timed out. Please retry."
        : "The hosted AI request could not be completed.";
    return requestError(status, message, headers);
  }
});
