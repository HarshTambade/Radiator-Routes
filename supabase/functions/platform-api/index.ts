import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const APP_NAME = "Atlas AI Platform API";
const APP_VERSION = "1.0.0";
const API_LIMIT_PER_MINUTE = 60;
const KNOWN_SCOPES = [
  "trips:read",
  "trips:write",
  "budget:read",
  "plans:generate",
  "orders:read",
  "orders:write",
] as const;
type ApiScope = (typeof KNOWN_SCOPES)[number];
type Principal = { keyId: string; userId: string; scopes: ApiScope[] };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "apikey",
    "content-type",
    "idempotency-key",
    "x-api-key",
    "x-client-info",
    "mcp-protocol-version",
    "mcp-method",
    "mcp-name",
  ].join(", "),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
  "Vary": "Origin",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

function responseHeaders(extra: Record<string, string> = {}) {
  return {
    ...corsHeaders,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(extraHeaders),
  });
}

function getRequestId() {
  return crypto.randomUUID();
}

function errorBody(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: { code: error.code, message: error.message, request_id: requestId },
      },
      headers: error.headers,
    };
  }
  return {
    status: 500,
    headers: {},
    body: {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
        request_id: requestId,
      },
    },
  };
}

function getFunctionPath(url: URL): string {
  const marker = "/functions/v1/platform-api";
  const position = url.pathname.indexOf(marker);
  if (position >= 0) return url.pathname.slice(position + marker.length) || "/";

  // Supabase's Edge Runtime can pass the function name as the path prefix
  // without the public `/functions/v1` gateway segment. Normalize that form
  // too so `/health`, `/mcp`, and versioned routes reach their handlers.
  const runtimePrefix = "/platform-api";
  const runtimePosition = url.pathname.indexOf(runtimePrefix);
  if (runtimePosition >= 0) {
    return url.pathname.slice(runtimePosition + runtimePrefix.length) || "/";
  }

  return url.pathname;
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function apiToken(request: Request): string | null {
  const xApiKey = request.headers.get("x-api-key")?.trim();
  const bearer = bearerToken(request);
  const candidate = xApiKey || bearer;
  return candidate?.startsWith("rr_live_") ? candidate : null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requireAdmin() {
  if (!admin || !supabaseUrl || !serviceRoleKey) {
    throw new ApiError(503, "service_unavailable", "The platform API is not configured.");
  }
  return admin;
}

async function authenticateApiKey(request: Request): Promise<{ principal: Principal; rateHeaders: Record<string, string> }> {
  const token = apiToken(request);
  if (!token || token.length > 160) {
    throw new ApiError(401, "unauthorized", "Provide a valid platform API key.");
  }

  const client = requireAdmin();
  const keyHash = await sha256(token);
  const { data: key, error } = await client
    .from("integration_api_keys")
    .select("id,user_id,scopes,expires_at,revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) throw new ApiError(503, "service_unavailable", "API key validation is unavailable.");
  if (!key || key.revoked_at || (key.expires_at && Date.parse(key.expires_at) <= Date.now())) {
    throw new ApiError(401, "unauthorized", "The API key is invalid, expired, or revoked.");
  }

  const { data: limit, error: limitError } = await client.rpc(
    "consume_integration_api_rate_limit",
    { p_api_key_id: key.id, p_limit: API_LIMIT_PER_MINUTE },
  ).maybeSingle();
  if (limitError || !limit) {
    throw new ApiError(503, "service_unavailable", "Request throttling is unavailable.");
  }

  const rateHeaders = {
    "X-RateLimit-Limit": String(API_LIMIT_PER_MINUTE),
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(Date.parse(limit.resets_at) / 1000)),
  };
  if (!limit.allowed) {
    throw new ApiError(429, "rate_limit_exceeded", "This API key has reached its 60 requests per minute limit.", rateHeaders);
  }

  await client.from("integration_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  const scopes = Array.isArray(key.scopes)
    ? key.scopes.filter((scope: string): scope is ApiScope => KNOWN_SCOPES.includes(scope as ApiScope))
    : [];
  return { principal: { keyId: key.id, userId: key.user_id, scopes }, rateHeaders };
}

function requireScope(principal: Principal, scope: ApiScope) {
  if (!principal.scopes.includes(scope)) {
    throw new ApiError(403, "insufficient_scope", `This key needs the '${scope}' scope.`);
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function cleanString(value: unknown, maxLength: number, field: string, required = true): string | null {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return null;
    throw new ApiError(400, "invalid_request", `${field} must be a string.`);
  }
  const result = value.trim();
  if (required && !result) throw new ApiError(400, "invalid_request", `${field} is required.`);
  if (result.length > maxLength) throw new ApiError(400, "invalid_request", `${field} must be ${maxLength} characters or fewer.`);
  return result || null;
}

function finiteAmount(value: unknown, field: string, optional = false): number | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
    throw new ApiError(400, "invalid_request", `${field} must be a number from 0 to 1000000000.`);
  }
  return Math.round(amount * 100) / 100;
}

async function accessibleTrip(tripId: string, userId: string) {
  const client = requireAdmin();
  const [{ data: trip, error: tripError }, { data: membership, error: memberError }] = await Promise.all([
    client.from("trips").select("*").eq("id", tripId).maybeSingle(),
    client.from("trip_memberships").select("id").eq("trip_id", tripId).eq("user_id", userId).maybeSingle(),
  ]);
  if (tripError || memberError) throw new ApiError(503, "service_unavailable", "Trip access could not be checked.");
  if (!trip || (!membership && trip.organizer_id !== userId)) {
    throw new ApiError(404, "not_found", "Trip not found.");
  }
  return trip;
}

async function listTrips(principal: Principal, url: URL) {
  requireScope(principal, "trips:read");
  const client = requireAdmin();
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  if (offset > 10_000) throw new ApiError(400, "invalid_request", "offset must be 10000 or less.");
  const [{ data: memberships, error: memberError }, { data: organized, error: organizerError }] = await Promise.all([
    client.from("trip_memberships").select("trip_id").eq("user_id", principal.userId),
    client.from("trips").select("id").eq("organizer_id", principal.userId),
  ]);
  if (memberError || organizerError) throw new ApiError(503, "service_unavailable", "Trips could not be loaded.");
  const ids = Array.from(new Set([
    ...(memberships ?? []).map((row: { trip_id: string }) => row.trip_id),
    ...(organized ?? []).map((row: { id: string }) => row.id),
  ]));
  if (!ids.length) return { data: [], pagination: { limit, offset, has_more: false } };
  const { data, error } = await client.from("trips").select("*").in("id", ids)
    .order("start_date", { ascending: true }).range(offset, offset + limit);
  if (error) throw new ApiError(503, "service_unavailable", "Trips could not be loaded.");
  const rows = data ?? [];
  return {
    data: rows.slice(0, limit),
    pagination: { limit, offset, has_more: rows.length > limit },
  };
}

async function createTrip(principal: Principal, body: Record<string, unknown>) {
  requireScope(principal, "trips:write");
  const name = cleanString(body.name, 120, "name")!;
  const destination = cleanString(body.destination, 120, "destination")!;
  const country = cleanString(body.country, 100, "country", false);
  if (!validDate(body.start_date) || !validDate(body.end_date) || body.end_date < body.start_date) {
    throw new ApiError(400, "invalid_request", "start_date and end_date must be valid YYYY-MM-DD dates, with end_date on or after start_date.");
  }
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : "INR";
  if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "invalid_request", "currency must be a three-letter ISO code.");
  const imageUrl = cleanString(body.image_url, 2048, "image_url", false);
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new ApiError(400, "invalid_request", "image_url must use HTTPS.");
  const budget = finiteAmount(body.budget_total, "budget_total", true);
  const { data, error } = await requireAdmin().from("trips").insert({
    name,
    destination,
    country,
    start_date: body.start_date,
    end_date: body.end_date,
    organizer_id: principal.userId,
    budget_total: budget ?? 0,
    currency,
    status: "planning",
    image_url: imageUrl,
  }).select("*").single();
  if (error) throw new ApiError(503, "service_unavailable", "The trip could not be created.");
  return { status: 201, data };
}

async function getTrip(principal: Principal, tripId: string) {
  requireScope(principal, "trips:read");
  return accessibleTrip(tripId, principal.userId);
}

async function getTripBudget(principal: Principal, tripId: string) {
  requireScope(principal, "budget:read");
  const trip = await accessibleTrip(tripId, principal.userId);
  const { data: expenses, error } = await requireAdmin().from("group_expenses")
    .select("amount,currency,category").eq("trip_id", tripId);
  if (error) throw new ApiError(503, "service_unavailable", "Trip expenses could not be loaded.");

  const spentByCurrency: Record<string, number> = {};
  const categoryTotals: Record<string, Record<string, number>> = {};
  for (const expense of expenses ?? []) {
    const currency = String(expense.currency ?? trip.currency ?? "INR").toUpperCase();
    const amount = Number(expense.amount) || 0;
    const category = String(expense.category ?? "other");
    spentByCurrency[currency] = (spentByCurrency[currency] ?? 0) + amount;
    categoryTotals[currency] ??= {};
    categoryTotals[currency][category] = (categoryTotals[currency][category] ?? 0) + amount;
  }
  for (const currency of Object.keys(spentByCurrency)) {
    spentByCurrency[currency] = Math.round(spentByCurrency[currency] * 100) / 100;
    for (const category of Object.keys(categoryTotals[currency])) {
      categoryTotals[currency][category] = Math.round(categoryTotals[currency][category] * 100) / 100;
    }
  }

  const currency = String(trip.currency ?? "INR").toUpperCase();
  const budgetTotal = Number(trip.budget_total ?? 0);
  const spent = spentByCurrency[currency] ?? 0;
  return {
    trip_id: trip.id,
    currency,
    budget_total: budgetTotal,
    spent,
    remaining: Math.round((budgetTotal - spent) * 100) / 100,
    over_budget: spent > budgetTotal,
    expenses_count: expenses?.length ?? 0,
    spent_by_currency: spentByCurrency,
    category_totals_by_currency: categoryTotals,
  };
}

function safeTime(value: unknown): { hour: string; minute: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour: match[1], minute: match[2] };
}

function normalizeActivity(activity: Record<string, unknown>, index: number, trip: Record<string, unknown>, days: number) {
  const name = cleanString(activity.name, 160, `activities[${index}].name`)!;
  const startDateRaw = typeof activity.start_time === "string" ? activity.start_time.slice(0, 10) : "";
  const startDayOffset = validDate(startDateRaw)
    ? Math.max(0, Math.min(days - 1, Math.round((Date.parse(`${startDateRaw}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`)) / 86_400_000)))
    : Math.min(days - 1, Math.floor(index / 4));
  const activityDate = addDays(String(trip.start_date), startDayOffset);
  const startClock = safeTime(activity.start_time) ?? { hour: "09", minute: "00" };
  const endClock = safeTime(activity.end_time);
  const startAt = `${activityDate}T${startClock.hour}:${startClock.minute}:00+05:30`;
  let endAt = endClock ? `${activityDate}T${endClock.hour}:${endClock.minute}:00+05:30` : "";
  if (!endAt || Date.parse(endAt) <= Date.parse(startAt)) {
    const end = new Date(Date.parse(startAt) + 90 * 60_000 + 330 * 60_000);
    endAt = `${end.toISOString().slice(0, 10)}T${end.toISOString().slice(11, 16)}:00+05:30`;
  }
  const cost = finiteAmount(activity.cost ?? 0, `activities[${index}].cost`) ?? 0;
  const allowedCategories = ["food", "attraction", "transport", "shopping", "accommodation", "other"];
  const category = typeof activity.category === "string" && allowedCategories.includes(activity.category)
    ? activity.category
    : "other";
  const lat = Number(activity.location_lat);
  const lng = Number(activity.location_lng);
  const review = Number(activity.review_score);
  const priority = Number(activity.priority);
  const steps = Number(activity.estimated_steps);
  return {
    name,
    description: cleanString(activity.description, 1200, `activities[${index}].description`, false),
    location_name: cleanString(activity.location_name, 200, `activities[${index}].location_name`, false),
    location_lat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    location_lng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null,
    start_time: startAt,
    end_time: endAt,
    category,
    cost,
    estimated_steps: Number.isInteger(steps) && steps >= 0 && steps <= 100_000 ? steps : null,
    review_score: Number.isFinite(review) && review >= 0 && review <= 5 ? review : null,
    priority: Number.isFinite(priority) && priority >= 0 && priority <= 1 ? priority : null,
    notes: cleanString(activity.notes, 1200, `activities[${index}].notes`, false),
    opening_hours: activity.opening_hours && typeof activity.opening_hours === "object" ? activity.opening_hours : null,
  };
}

function verifyGeneratedSchedule(activities: ReturnType<typeof normalizeActivity>[], budget: number, days: number) {
  if (activities.length > days * 6) {
    throw new ApiError(422, "plan_pace_exceeded", "The generated plan has more than six activities on at least one trip day. Retry to create a lighter plan.");
  }
  const byDay = new Map<string, ReturnType<typeof normalizeActivity>[]>();
  for (const activity of activities) {
    const day = activity.start_time.slice(0, 10);
    const dayActivities = byDay.get(day) ?? [];
    dayActivities.push(activity);
    byDay.set(day, dayActivities);
    const durationHours = (Date.parse(activity.end_time) - Date.parse(activity.start_time)) / 3_600_000;
    if (durationHours <= 0 || durationHours > 14) {
      throw new ApiError(422, "plan_duration_invalid", `Activity '${activity.name}' has an implausible duration.`);
    }
  }
  if (Array.from(byDay.values()).some((items) => items.length > 6)) {
    throw new ApiError(422, "plan_pace_exceeded", "The generated plan has more than six activities on at least one trip day. Retry to create a lighter plan.");
  }
  for (const [day, items] of byDay) {
    items.sort((left, right) => Date.parse(left.start_time) - Date.parse(right.start_time));
    for (let index = 1; index < items.length; index++) {
      if (Date.parse(items[index].start_time) < Date.parse(items[index - 1].end_time)) {
        throw new ApiError(422, "plan_time_overlap", `The generated plan schedules overlapping activities on ${day}. Retry to generate a valid schedule.`);
      }
    }
  }
  const total = activities.reduce((sum, activity) => sum + activity.cost, 0);
  if (total > budget * 1.02) {
    throw new ApiError(422, "plan_over_budget", "The generated activities exceed the trip budget. Adjust the budget or retry.");
  }
}

async function generateTripPlan(principal: Principal, tripId: string, body: Record<string, unknown>) {
  requireScope(principal, "plans:generate");
  const trip = await accessibleTrip(tripId, principal.userId);
  const tripCurrency = String(trip.currency ?? "INR").toUpperCase();
  if (tripCurrency !== "INR") {
    throw new ApiError(422, "unsupported_currency", "AI itinerary generation currently accepts INR budgets.");
  }
  const country = String(trip.country ?? "").trim().toLowerCase();
  if (!country || !["india", "in", "ind"].includes(country)) {
    throw new ApiError(422, "unsupported_destination", "AI itinerary generation currently supports India trips with dates in India Standard Time. Set the trip country to India.");
  }
  const startDate = String(trip.start_date);
  const endDate = String(trip.end_date);
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (!Number.isInteger(days) || days < 1 || days > 14) {
    throw new ApiError(422, "trip_duration_unsupported", "AI itinerary generation supports trips from 1 to 14 days.");
  }
  const budget = Number(trip.budget_total ?? 0);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new ApiError(422, "budget_required", "Set a positive trip budget before generating an itinerary.");
  }

  let defaultTravelers = 1;
  if (body.travelers === undefined) {
    const { count, error: memberCountError } = await requireAdmin().from("trip_memberships")
      .select("id", { count: "exact", head: true }).eq("trip_id", tripId);
    if (memberCountError) throw new ApiError(503, "service_unavailable", "Trip members could not be counted.");
    defaultTravelers = Math.max(1, count ?? 1);
  }
  const travelers = body.travelers === undefined ? defaultTravelers : Number(body.travelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 50) {
    throw new ApiError(400, "invalid_request", "travelers must be an integer from 1 to 50.");
  }
  const interests = Array.isArray(body.interests)
    ? body.interests.slice(0, 12).map((item, index) => cleanString(item, 40, `interests[${index}]`)!)
    : [];
  const tripType = typeof body.trip_type === "string" ? body.trip_type.slice(0, 40) : "leisure";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new ApiError(503, "service_unavailable", "The itinerary planner is not configured.");
  }

  let plannerResponse: Response;
  try {
    plannerResponse = await fetch(`${supabaseUrl}/functions/v1/ai-planner`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": anonKey,
        "Content-Type": "application/json",
        "x-platform-user-id": principal.userId,
      },
      body: JSON.stringify({
        action: "plan-itinerary",
        destination: `${trip.destination}, ${["in", "ind"].includes(country) ? "India" : trip.country}`,
        startDate,
        days,
        travelers,
        budget,
        interests: interests.length ? interests : ["culture", "food", "sightseeing"],
        tripType,
      }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new ApiError(503, "planner_unavailable", "The itinerary planner did not respond. Please retry shortly.");
  }
  if (!plannerResponse.ok) {
    const status = plannerResponse.status === 429 ? 429 : plannerResponse.status === 402 ? 503 : 502;
    throw new ApiError(status, "planner_unavailable", "The itinerary planner could not generate a plan. Check the planner configuration or retry shortly.");
  }

  let plan: Record<string, unknown>;
  try {
    plan = await plannerResponse.json();
  } catch {
    throw new ApiError(502, "invalid_plan", "The itinerary planner returned invalid data.");
  }
  if (!Array.isArray(plan.activities) || plan.activities.length < 1 || plan.activities.length > 80) {
    throw new ApiError(502, "invalid_plan", "The itinerary planner returned an unsupported activity list.");
  }
  const activities = plan.activities.map((activity, index) => {
    if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
      throw new ApiError(502, "invalid_plan", "The itinerary planner returned an invalid activity.");
    }
    return normalizeActivity(activity as Record<string, unknown>, index, trip, days);
  });
  verifyGeneratedSchedule(activities, budget, days);
  const costTotal = Math.round(activities.reduce((sum, activity) => sum + activity.cost, 0) * 100) / 100;

  const client = requireAdmin();
  const { data: latest, error: latestError } = await client.from("itineraries")
    .select("version").eq("trip_id", tripId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new ApiError(503, "service_unavailable", "The existing itinerary version could not be read.");
  const { data: itinerary, error: itineraryError } = await client.from("itineraries").insert({
    trip_id: tripId,
    version: Number(latest?.version ?? 0) + 1,
    cost_breakdown: { total: costTotal, currency: tripCurrency, source: "model" },
    is_published: false,
    created_by: principal.userId,
  }).select("*").single();
  if (itineraryError) throw new ApiError(503, "service_unavailable", "The itinerary could not be saved.");

  const { data: savedActivities, error: activityError } = await client.from("activities")
    .insert(activities.map((activity) => ({ ...activity, itinerary_id: itinerary.id }))).select("*");
  if (activityError) {
    await client.from("itineraries").delete().eq("id", itinerary.id);
    throw new ApiError(503, "service_unavailable", "The generated activities could not be saved.");
  }
  return {
    trip_id: tripId,
    itinerary,
    activities: savedActivities ?? [],
    total_cost: costTotal,
    currency: tripCurrency,
    explanation: typeof plan.explanation === "string" ? plan.explanation.slice(0, 2000) : "",
    message: "The itinerary was generated and saved. Review it before sharing or booking.",
  };
}

function containsSensitiveField(value: unknown, depth = 0): boolean {
  if (depth > 6 || !value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(card|credit|debit|cvv|cvc|cc_?number|pan|bank_account|account_number|iban|routing_number|password|secret|token|authorization|payment_method)/i.test(key)) return true;
    if (containsSensitiveField(child, depth + 1)) return true;
  }
  return false;
}

async function createOrder(principal: Principal, request: Request, body: Record<string, unknown>) {
  requireScope(principal, "orders:write");
  const orderType = body.order_type;
  const allowedTypes = ["flight", "hotel", "activity", "transport", "package", "other"];
  if (typeof orderType !== "string" || !allowedTypes.includes(orderType)) {
    throw new ApiError(400, "invalid_request", `order_type must be one of: ${allowedTypes.join(", ")}.`);
  }
  const itemName = cleanString(body.item_name, 160, "item_name")!;
  const provider = cleanString(body.provider, 100, "provider", false);
  const tripId = body.trip_id === undefined || body.trip_id === null || body.trip_id === "" ? null : body.trip_id;
  let trip: Record<string, unknown> | null = null;
  if (tripId !== null) {
    if (!isUuid(tripId)) throw new ApiError(400, "invalid_request", "trip_id must be a UUID.");
    trip = await accessibleTrip(tripId, principal.userId);
  }
  const details = body.details === undefined ? {} : body.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    throw new ApiError(400, "invalid_request", "details must be a JSON object.");
  }
  const detailsJson = JSON.stringify(details);
  if (detailsJson.length > 20_000) throw new ApiError(413, "payload_too_large", "details must be 20000 characters or fewer.");
  if (containsSensitiveField(details)) {
    throw new ApiError(400, "sensitive_data_rejected", "Do not include card, payment, password, token, or authentication data in order details.");
  }
  const currency = typeof body.currency === "string"
    ? body.currency.toUpperCase()
    : String(trip?.currency ?? "INR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "invalid_request", "currency must be a three-letter ISO code.");
  const quotedAmount = finiteAmount(body.quoted_amount, "quoted_amount", true);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim()
    || (typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "")
    || null;
  if (idempotencyKey && (idempotencyKey.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey))) {
    throw new ApiError(400, "invalid_request", "Idempotency-Key may contain letters, numbers, period, underscore, colon, and hyphen (up to 128 characters).");
  }
  const client = requireAdmin();
  if (idempotencyKey) {
    const { data: existing } = await client.from("travel_orders").select("*")
      .eq("user_id", principal.userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) return { status: 200, data: existing };
  }
  const { data, error } = await client.from("travel_orders").insert({
    user_id: principal.userId,
    trip_id: tripId,
    order_type: orderType,
    item_name: itemName,
    provider,
    status: "requested",
    currency,
    quoted_amount: quotedAmount,
    details,
    idempotency_key: idempotencyKey,
  }).select("*").single();
  if (error && idempotencyKey && error.code === "23505") {
    const { data: existing } = await client.from("travel_orders").select("*")
      .eq("user_id", principal.userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) return { status: 200, data: existing };
  }
  if (error) throw new ApiError(503, "service_unavailable", "The booking request could not be recorded.");
  return {
    status: 201,
    data: {
      ...data,
      fulfillment: "request_recorded_only",
      notice: "No provider booking was placed and no payment was charged.",
    },
  };
}

async function listOrders(principal: Principal, url: URL) {
  requireScope(principal, "orders:read");
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  if (offset > 10_000) throw new ApiError(400, "invalid_request", "offset must be 10000 or less.");
  const { data, error } = await requireAdmin().from("travel_orders").select("*")
    .eq("user_id", principal.userId).order("created_at", { ascending: false }).range(offset, offset + limit);
  if (error) throw new ApiError(503, "service_unavailable", "Order requests could not be loaded.");
  const rows = data ?? [];
  return { data: rows.slice(0, limit), pagination: { limit, offset, has_more: rows.length > limit } };
}

async function getOrder(principal: Principal, orderId: string) {
  requireScope(principal, "orders:read");
  if (!isUuid(orderId)) throw new ApiError(404, "not_found", "Order request not found.");
  const { data, error } = await requireAdmin().from("travel_orders").select("*")
    .eq("id", orderId).eq("user_id", principal.userId).maybeSingle();
  if (error) throw new ApiError(503, "service_unavailable", "Order request could not be loaded.");
  if (!data) throw new ApiError(404, "not_found", "Order request not found.");
  return data;
}

async function dispatchRest(method: string, route: string, url: URL, body: Record<string, unknown>, request: Request, principal: Principal) {
  const parts = route.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] !== "v1") throw new ApiError(404, "not_found", "Endpoint not found.");
  const resource = parts[1];
  if (resource === "trips" && parts.length === 2 && method === "GET") {
    return { status: 200, data: await listTrips(principal, url) };
  }
  if (resource === "trips" && parts.length === 2 && method === "POST") {
    return await createTrip(principal, body);
  }
  if (resource === "trips" && parts.length === 3 && method === "GET") {
    return { status: 200, data: await getTrip(principal, parts[2]) };
  }
  if (resource === "trips" && parts.length === 4 && parts[3] === "budget" && method === "GET") {
    return { status: 200, data: await getTripBudget(principal, parts[2]) };
  }
  if (resource === "trips" && parts.length === 4 && parts[3] === "plan" && method === "POST") {
    return { status: 201, data: await generateTripPlan(principal, parts[2], body) };
  }
  if (resource === "orders" && parts.length === 2 && method === "GET") {
    return { status: 200, data: await listOrders(principal, url) };
  }
  if (resource === "orders" && parts.length === 2 && method === "POST") {
    return await createOrder(principal, request, body);
  }
  if (resource === "orders" && parts.length === 3 && method === "GET") {
    return { status: 200, data: await getOrder(principal, parts[2]) };
  }
  throw new ApiError(404, "not_found", "Endpoint not found.");
}

function openApiDocument() {
  const baseUrl = `${supabaseUrl}/functions/v1/platform-api/v1`;
  return {
    openapi: "3.1.0",
    info: {
      title: "Atlas AI Platform API",
      version: APP_VERSION,
      description: "Scoped API for trip planning, budget summaries, and booking request records.",
    },
    servers: [{ url: baseUrl }],
    security: [{ platformApiKey: [], supabasePublishableKey: [] }],
    components: {
      securitySchemes: {
        platformApiKey: { type: "apiKey", in: "header", name: "x-api-key", description: "Create a scoped key in Atlas AI → Integrations → API." },
        supabasePublishableKey: { type: "apiKey", in: "header", name: "apikey", description: "The public Supabase publishable key for the project." },
      },
      schemas: {
        Trip: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, destination: { type: "string" }, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" }, budget_total: { type: "number" }, currency: { type: "string" } } },
        CreateTrip: { type: "object", required: ["name", "destination", "start_date", "end_date"], properties: { name: { type: "string" }, destination: { type: "string" }, country: { type: "string" }, start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" }, budget_total: { type: "number", minimum: 0 }, currency: { type: "string", default: "INR" }, image_url: { type: "string", format: "uri" } } },
        BookingRequest: { type: "object", required: ["order_type", "item_name"], properties: { order_type: { enum: ["flight", "hotel", "activity", "transport", "package", "other"] }, item_name: { type: "string" }, trip_id: { type: "string", format: "uuid" }, provider: { type: "string" }, quoted_amount: { type: "number" }, currency: { type: "string" }, details: { type: "object" } } },
      },
    },
    paths: {
      "/trips": {
        get: { summary: "List accessible trips", parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 100 } }, { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } }], responses: { "200": { description: "Trip page" } } },
        post: { summary: "Create a trip", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTrip" } } } }, responses: { "201": { description: "Trip created" } } },
      },
      "/trips/{trip_id}": { get: { summary: "Get a trip", parameters: [{ name: "trip_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Trip" } } } },
      "/trips/{trip_id}/budget": { get: { summary: "Summarize trip budget and expenses", parameters: [{ name: "trip_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Budget summary by currency" } } } },
      "/trips/{trip_id}/plan": { post: { summary: "Generate and save an AI itinerary", parameters: [{ name: "trip_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { travelers: { type: "integer", minimum: 1, maximum: 50 }, interests: { type: "array", items: { type: "string" } }, trip_type: { type: "string" } } } } } }, responses: { "201": { description: "Itinerary saved" } } } },
      "/orders": {
        get: { summary: "List booking request records", responses: { "200": { description: "Order request page" } } },
        post: { summary: "Record a booking request", parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 128 } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/BookingRequest" } } } }, responses: { "201": { description: "Request recorded; provider booking/payment not performed" } } },
      },
      "/orders/{order_id}": { get: { summary: "Get a booking request", parameters: [{ name: "order_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Booking request" } } } },
    },
  };
}

const MCP_TOOLS = [
  { name: "list_trips", description: "List trips available to the API key owner.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, scope: "trips:read" as ApiScope },
  { name: "get_trip", description: "Read one trip the API key owner belongs to.", inputSchema: { type: "object", required: ["trip_id"], properties: { trip_id: { type: "string", description: "Trip UUID" } }, additionalProperties: false }, scope: "trips:read" as ApiScope },
  { name: "create_trip", description: "Create a trip for the API key owner.", inputSchema: { type: "object", required: ["name", "destination", "start_date", "end_date"], properties: { name: { type: "string" }, destination: { type: "string" }, country: { type: "string" }, start_date: { type: "string", description: "YYYY-MM-DD" }, end_date: { type: "string", description: "YYYY-MM-DD" }, budget_total: { type: "number" }, currency: { type: "string", default: "INR" } }, additionalProperties: false }, scope: "trips:write" as ApiScope },
  { name: "get_trip_budget", description: "Summarize planned budget and recorded expenses, grouped by currency.", inputSchema: { type: "object", required: ["trip_id"], properties: { trip_id: { type: "string" } }, additionalProperties: false }, scope: "budget:read" as ApiScope },
  { name: "generate_trip_plan", description: "Generate and save an AI itinerary for an India trip with an INR budget. Review the plan before sharing or booking.", inputSchema: { type: "object", required: ["trip_id"], properties: { trip_id: { type: "string" }, travelers: { type: "integer", minimum: 1, maximum: 50 }, interests: { type: "array", items: { type: "string" }, maxItems: 12 }, trip_type: { type: "string" } }, additionalProperties: false }, scope: "plans:generate" as ApiScope },
  { name: "create_booking_request", description: "Record an auditable booking request. This does not place a provider booking or charge a payment method.", inputSchema: { type: "object", required: ["order_type", "item_name"], properties: { order_type: { type: "string", enum: ["flight", "hotel", "activity", "transport", "package", "other"] }, item_name: { type: "string" }, trip_id: { type: "string" }, provider: { type: "string" }, quoted_amount: { type: "number" }, currency: { type: "string" }, idempotency_key: { type: "string", maxLength: 128 }, details: { type: "object" } }, additionalProperties: false }, scope: "orders:write" as ApiScope },
  { name: "list_booking_requests", description: "List booking request records created by the API key owner.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, scope: "orders:read" as ApiScope },
];

function mcpError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function callMcpTool(principal: Principal, name: string, args: Record<string, unknown>, request: Request, url: URL) {
  const tool = MCP_TOOLS.find((item) => item.name === name);
  if (!tool) throw new ApiError(404, "unknown_tool", `Unknown tool '${name}'.`);
  requireScope(principal, tool.scope);
  switch (name) {
    case "list_trips":
      return await listTrips(principal, url);
    case "get_trip":
      if (!isUuid(args.trip_id)) throw new ApiError(400, "invalid_request", "trip_id must be a UUID.");
      return await getTrip(principal, args.trip_id);
    case "create_trip":
      return (await createTrip(principal, args)).data;
    case "get_trip_budget":
      if (!isUuid(args.trip_id)) throw new ApiError(400, "invalid_request", "trip_id must be a UUID.");
      return await getTripBudget(principal, args.trip_id);
    case "generate_trip_plan":
      if (!isUuid(args.trip_id)) throw new ApiError(400, "invalid_request", "trip_id must be a UUID.");
      return await generateTripPlan(principal, args.trip_id, args);
    case "create_booking_request":
      return (await createOrder(principal, request, args)).data;
    case "list_booking_requests":
      return await listOrders(principal, url);
    default:
      throw new ApiError(404, "unknown_tool", `Unknown tool '${name}'.`);
  }
}

async function handleMcp(request: Request, url: URL, requestId: string): Promise<Response> {
  const { principal, rateHeaders } = await authenticateApiKey(request);
  let message: Record<string, unknown>;
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 1_000_000) throw new ApiError(413, "payload_too_large", "MCP request body is too large.");
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid");
    message = input as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return json(mcpError(null, -32700, "Parse error"), 400, rateHeaders);
  }
  const method = typeof message.method === "string" ? message.method : "";
  const requestMeta = (message.params as Record<string, unknown> | undefined)?._meta as Record<string, unknown> | undefined;
  const bodyProtocolVersion = requestMeta?.["io.modelcontextprotocol/protocolVersion"];
  const headerVersion = request.headers.get("mcp-protocol-version");
  const protocolVersion = headerVersion ?? bodyProtocolVersion as string | undefined;
  const modern = protocolVersion === "2026-07-28";
  const headerMethod = request.headers.get("mcp-method");
  const params = (message.params && typeof message.params === "object" && !Array.isArray(message.params))
    ? message.params as Record<string, unknown>
    : {};
  const id = message.id;

  if (headerVersion && typeof bodyProtocolVersion === "string" && headerVersion !== bodyProtocolVersion) {
    return json(mcpError(id, -32020, "MCP-Protocol-Version must match request metadata."), 400, rateHeaders);
  }
  if (modern) {
    if (headerVersion !== "2026-07-28" || bodyProtocolVersion !== "2026-07-28") {
      return json(mcpError(id, -32020, "MCP-Protocol-Version and request metadata must be 2026-07-28."), 400, rateHeaders);
    }
    if (headerMethod !== method) return json(mcpError(id, -32020, "Mcp-Method header must match the JSON-RPC method."), 400, rateHeaders);
    if (method === "tools/call") {
      const toolName = (params as { name?: unknown }).name;
      if (request.headers.get("mcp-name") !== toolName) return json(mcpError(id, -32020, "Mcp-Name header must match the requested tool."), 400, rateHeaders);
    }
  }
  if (message.jsonrpc !== "2.0" || !method) return json(mcpError(id, -32600, "Invalid JSON-RPC request."), 400, rateHeaders);

  if (method.startsWith("notifications/")) return new Response(null, { status: 202, headers: responseHeaders(rateHeaders) });
  if (id === undefined || id === null) return json(mcpError(null, -32600, "A request id is required."), 400, rateHeaders);

  if (method === "server/discover") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        resultType: "complete",
        supportedVersions: ["2026-07-28", "2025-11-25"],
        capabilities: { tools: { listChanged: false } },
        _meta: { "io.modelcontextprotocol/serverInfo": { name: APP_NAME, version: APP_VERSION } },
        ttlMs: 60_000,
        cacheScope: "private",
      },
    }, 200, rateHeaders);
  }
  if (method === "initialize") {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-11-25";
    const legacyVersion = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"].includes(requested)
      ? requested
      : "2025-11-25";
    return json({ jsonrpc: "2.0", id, result: {
      protocolVersion: legacyVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: APP_NAME, version: APP_VERSION },
      instructions: "Use the listed tools for trips, budget summaries, itinerary planning, and booking request records.",
    } }, 200, rateHeaders);
  }
  if (method === "tools/list") {
    const available = MCP_TOOLS.filter((tool) => principal.scopes.includes(tool.scope));
    return json({ jsonrpc: "2.0", id, result: { resultType: "complete", ttlMs: 60_000, cacheScope: "private", tools: available.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
      annotations: {
        readOnlyHint: ["list_trips", "get_trip", "get_trip_budget", "list_booking_requests"].includes(name),
        destructiveHint: false,
        idempotentHint: ["get_trip", "get_trip_budget", "list_trips", "list_booking_requests"].includes(name),
        openWorldHint: name === "generate_trip_plan",
      },
    })), _meta: { "io.modelcontextprotocol/serverInfo": { name: APP_NAME, version: APP_VERSION } } } }, 200, rateHeaders);
  }
  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? params.arguments as Record<string, unknown>
      : {};
    try {
      const result = await callMcpTool(principal, name, args, request, url);
      return json({ jsonrpc: "2.0", id, result: {
        resultType: "complete",
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: false,
        _meta: { "io.modelcontextprotocol/serverInfo": { name: APP_NAME, version: APP_VERSION } },
      } }, 200, rateHeaders);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "The tool call could not be completed.";
      return json({ jsonrpc: "2.0", id, result: {
        resultType: "complete",
        content: [{ type: "text", text: message }],
        isError: true,
        _meta: { "io.modelcontextprotocol/serverInfo": { name: APP_NAME, version: APP_VERSION } },
      } }, 200, rateHeaders);
    }
  }
  return json(mcpError(id, -32601, `Method not found: ${method}`), 200, rateHeaders);
}

async function authenticateDashboardUser(request: Request) {
  const token = bearerToken(request);
  if (!token || token.startsWith("rr_live_")) throw new ApiError(401, "unauthorized", "Sign in to manage API keys.");
  const { data, error } = await requireAdmin().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "unauthorized", "Your session is invalid or expired.");
  return data.user;
}

async function handleKeyManagement(request: Request): Promise<Response> {
  const user = await authenticateDashboardUser(request);
  let body: Record<string, unknown>;
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid");
    body = input as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "invalid_request", "A JSON request body is required.");
  }
  const client = requireAdmin();

  if (body.action === "list_keys") {
    const { data, error } = await client.from("integration_api_keys")
      .select("id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (error) throw new ApiError(503, "service_unavailable", "API keys could not be loaded.");
    return json({ keys: data ?? [] });
  }

  if (body.action === "create_key") {
    const name = cleanString(body.name, 80, "name")!;
    const scopes = Array.isArray(body.scopes) ? body.scopes : [];
    if (!scopes.length || scopes.some((scope) => typeof scope !== "string" || !KNOWN_SCOPES.includes(scope as ApiScope))) {
      throw new ApiError(400, "invalid_request", `Choose one or more supported scopes: ${KNOWN_SCOPES.join(", ")}.`);
    }
    const { data: accountKeys, error: countError } = await client.from("integration_api_keys")
      .select("expires_at,revoked_at").eq("user_id", user.id);
    if (countError) throw new ApiError(503, "service_unavailable", "The active key limit could not be checked.");
    const activeCount = (accountKeys ?? []).filter((key: { expires_at: string | null; revoked_at: string | null }) =>
      !key.revoked_at && (!key.expires_at || Date.parse(key.expires_at) > Date.now()),
    ).length;
    if (activeCount >= 10) throw new ApiError(409, "key_limit_reached", "Revoke an unused key before creating another. Each account can have up to 10 active keys.");

    let expiresAt: string | null = null;
    if (body.expires_in_days !== null && body.expires_in_days !== undefined) {
      const days = Number(body.expires_in_days);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError(400, "invalid_request", "expires_in_days must be from 1 to 365, or null for no expiry.");
      expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    }

    const random = crypto.getRandomValues(new Uint8Array(32));
    const rawKey = `rr_live_${base64Url(random)}`;
    const keyHash = await sha256(rawKey);
    const { data, error } = await client.from("integration_api_keys").insert({
      user_id: user.id,
      name,
      key_prefix: rawKey.slice(0, 16),
      key_hash: keyHash,
      scopes: Array.from(new Set(scopes)),
      expires_at: expiresAt,
    }).select("id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at").single();
    if (error) throw new ApiError(503, "service_unavailable", "The API key could not be created.");
    return json({ key: data, secret: rawKey }, 201);
  }

  if (body.action === "revoke_key") {
    if (!isUuid(body.key_id)) throw new ApiError(400, "invalid_request", "key_id must be a UUID.");
    const { data, error } = await client.from("integration_api_keys").update({ revoked_at: new Date().toISOString() })
      .eq("id", body.key_id).eq("user_id", user.id).is("revoked_at", null).select("id").maybeSingle();
    if (error) throw new ApiError(503, "service_unavailable", "The API key could not be revoked.");
    if (!data) throw new ApiError(404, "not_found", "Active API key not found.");
    return json({ revoked: true, key_id: data.id });
  }

  throw new ApiError(400, "invalid_request", "action must be list_keys, create_key, or revoke_key.");
}

Deno.serve(async (request: Request) => {
  const requestId = getRequestId();
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders() });

  const url = new URL(request.url);
  const route = getFunctionPath(url);
  try {
    if (route === "/health" && request.method === "GET") {
      const { error } = await requireAdmin().from("integration_api_keys")
        .select("id", { head: true, count: "exact" });
      if (error) return json({ status: "not_ready" }, 503);
      return json({ status: "ok", version: APP_VERSION });
    }
    if (route === "/v1/openapi.json" && request.method === "GET") return json(openApiDocument());
    if (route === "/mcp" || route === "/mcp/") {
      if (request.method !== "POST") throw new ApiError(405, "method_not_allowed", "MCP Streamable HTTP uses POST requests.");
      return await handleMcp(request, url, requestId);
    }
    if (route === "/" || route === "") {
      if (request.method !== "POST") throw new ApiError(405, "method_not_allowed", "Key management uses POST requests.");
      return await handleKeyManagement(request);
    }

    const { principal, rateHeaders } = await authenticateApiKey(request);
    if (request.method !== "GET" && request.method !== "POST") {
      throw new ApiError(405, "method_not_allowed", "Only GET and POST are supported.");
    }
    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > 1_000_000) throw new ApiError(413, "payload_too_large", "Request body is too large.");
      try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
        body = parsed as Record<string, unknown>;
      } catch {
        throw new ApiError(400, "invalid_request", "POST requests require a JSON object body.");
      }
    }
    const result = await dispatchRest(request.method, route, url, body, request, principal);
    return json(result.data, result.status, rateHeaders);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(`[platform-api] request ${requestId} failed`, error instanceof Error ? error.name : "unknown_error");
    const result = errorBody(error, requestId);
    const extra = {
      ...(result.headers ?? {}),
      ...(result.status === 401 ? { "WWW-Authenticate": 'Bearer realm="Atlas AI Platform API"' } : {}),
    };
    return json(result.body, result.status, extra);
  }
});
