// ─────────────────────────────────────────────────────────────────────────────
// Shared HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────
// Every external service in src/services was repeating the same
// fetch → check res.ok → parse → throw-with-context dance. This centralises
// it and adds timeouts + retries, which none of the call sites had.
// ─────────────────────────────────────────────────────────────────────────────

/** Error carrying the HTTP status and a truncated response body. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText} — ${truncate(body, 200)}`);
    this.name = "HttpError";
  }
}

export interface RequestOptions extends Omit<RequestInit, "signal"> {
  /** Abort after this many milliseconds. Default 15000. */
  timeoutMs?: number;
  /** Retry attempts for network errors / 5xx / 429. Default 0. */
  retries?: number;
  /** Base delay for exponential backoff between retries (ms). Default 400. */
  retryDelayMs?: number;
  /** Label used in thrown error messages, e.g. "Open-Meteo". */
  label?: string;
}

const DEFAULT_TIMEOUT = 15_000;

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * fetch with a timeout, optional retries and consistent error reporting.
 * Resolves with the raw Response so callers choose how to read the body.
 */
export async function request(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    retries = 0,
    retryDelayMs = 400,
    label,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return res;

      const body = await res.text().catch(() => "");

      if (attempt < retries && isRetryable(res.status)) {
        lastError = new HttpError(res.status, res.statusText, body, url);
        await sleep(retryDelayMs * 2 ** attempt);
        continue;
      }

      throw new HttpError(
        res.status,
        label ? `${label} ${res.statusText}` : res.statusText,
        body,
        url,
      );
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof HttpError) throw err;

      // AbortError (timeout) or a genuine network failure
      const isAbort = (err as Error)?.name === "AbortError";
      lastError = isAbort
        ? new Error(
            `${label ?? "Request"} timed out after ${timeoutMs}ms: ${url}`,
          )
        : err;

      if (attempt < retries) {
        await sleep(retryDelayMs * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`${label ?? "Request"} failed: ${url}`);
}

/** GET + parse JSON. */
export async function getJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const res = await request(url, {
    retries: 1,
    ...options,
    method: "GET",
    headers: { Accept: "application/json", ...(options.headers ?? {}) },
  });
  return res.json() as Promise<T>;
}

/** POST a JSON body + parse the JSON response. */
export async function postJson<T>(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const res = await request(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

/** Build a query string, dropping null/undefined/empty values. */
export function qs(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
