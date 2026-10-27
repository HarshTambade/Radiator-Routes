// ─────────────────────────────────────────────────────────────────────────────
// Jinny's typed actions — the app's own operations, callable by voice or chat
// ─────────────────────────────────────────────────────────────────────────────
// Each action does what the matching screen does (same tables, same offline
// queue, same split and category rules), so "add a 600 rupee dinner to Goa"
// produces exactly the row the Trip Money form would. Row-Level Security still
// decides what is allowed; nothing here runs with more privilege than a tap.
//
// Anything destructive or outward-facing declares a `confirm` question. The
// assistant asks it, and only a clear yes from the user runs the action.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { mutateWithOfflineQueue, newId } from "@/lib/offlineMutation";
import { formatMoney, normalizeCurrencyCode } from "@/lib/currency";
import { formatLocalDate, parseLocalDate } from "@/lib/date";
import { draftFromPreferences, normalisePace, preferencesPatch, EDITABLE_CATEGORIES } from "@/lib/travelPreferences";
import type { ActivityCategory } from "@/lib/groupRegret";

export type ActionArgs = Record<string, unknown>;

export interface JinnyActionContext {
  userId: string | null;
  /** Trip open on screen, if any (from /itinerary/:tripId). */
  currentTripId: string | null;
  /** Page origin, for building shareable links. */
  origin: string;
  invalidate: (queryKey: unknown[]) => void;
  navigate: (path: string) => void;
}

export interface JinnyActionSpec {
  /** A question to ask before running, or null when it is safe to run directly. */
  confirm?: (args: ActionArgs, ctx: JinnyActionContext) => Promise<string | null>;
  /** Runs the action and returns a short, factual result for the model. */
  run: (args: ActionArgs, ctx: JinnyActionContext) => Promise<string>;
}

/** A failure worth telling the user about in plain words (not a crash). */
export class ActionError extends Error {}

// ── Argument helpers ─────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function requireUser(ctx: JinnyActionContext): string {
  if (!ctx.userId) throw new ActionError("You need to be signed in for that.");
  return ctx.userId;
}

const validIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && formatLocalDate(parseLocalDate(v)) === v;

// ── Trips ────────────────────────────────────────────────────────────────────

interface TripRow {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  currency: string | null;
  budget_total: number | null;
  organizer_id: string;
}

const TRIP_COLUMNS = "id, name, destination, start_date, end_date, currency, budget_total, organizer_id";

/**
 * The trip an action is about: an explicit id, else a name or destination
 * ("the Goa trip"), else the trip open on screen, else the next upcoming one.
 */
export async function resolveTrip(args: ActionArgs, ctx: JinnyActionContext): Promise<TripRow> {
  requireUser(ctx);
  const id = str(args.trip_id);
  if (UUID.test(id)) {
    const { data, error } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) return data as TripRow;
  }

  const name = str(args.trip_name) || str(args.trip) || (id && !UUID.test(id) ? id : "");
  if (name) {
    const pattern = `%${name.replace(/[%_]/g, "").replace(/\btrip\b/i, "").trim()}%`;
    const { data, error } = await supabase
      .from("trips")
      .select(TRIP_COLUMNS)
      .or(`name.ilike.${pattern},destination.ilike.${pattern}`)
      .order("start_date", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (data?.length === 1) return data[0] as TripRow;
    if (data && data.length > 1) {
      throw new ActionError(`More than one trip matches "${name}": ${data.map((t) => t.name).join(", ")}. Which one?`);
    }
    throw new ActionError(`I couldn't find a trip called "${name}".`);
  }

  if (ctx.currentTripId) {
    const { data } = await supabase.from("trips").select(TRIP_COLUMNS).eq("id", ctx.currentTripId).maybeSingle();
    if (data) return data as TripRow;
  }

  const today = formatLocalDate(new Date());
  const { data: upcoming } = await supabase
    .from("trips").select(TRIP_COLUMNS).gte("end_date", today)
    .order("start_date", { ascending: true }).limit(1);
  if (upcoming?.[0]) return upcoming[0] as TripRow;
  const { data: recent } = await supabase
    .from("trips").select(TRIP_COLUMNS).order("start_date", { ascending: false }).limit(1);
  if (recent?.[0]) return recent[0] as TripRow;
  throw new ActionError("You don't have any trips yet. Want me to create one?");
}

async function tripMemberIds(tripId: string): Promise<string[]> {
  const { data, error } = await supabase.from("trip_memberships").select("user_id").eq("trip_id", tripId);
  if (error) throw error;
  return (data ?? []).map((m) => m.user_id as string);
}

async function latestItineraryId(tripId: string, create: { userId: string } | null): Promise<string | null> {
  const { data, error } = await supabase
    .from("itineraries").select("id").eq("trip_id", tripId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (data) return data.id;
  if (!create) return null;
  const { data: created, error: createError } = await supabase
    .from("itineraries").insert({ trip_id: tripId, created_by: create.userId, version: 1 }).select("id").single();
  if (createError) throw createError;
  return created.id;
}

// ── People ───────────────────────────────────────────────────────────────────

interface Person { id: string; name: string }

async function friendsOf(userId: string): Promise<Person[]> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("sender_id, receiver_id")
    .eq("status", "accepted")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (error) throw error;
  const ids = (data ?? []).map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id));
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, name").in("id", ids);
  if (profileError) throw profileError;
  return (profiles ?? []).map((p) => ({ id: p.id, name: p.name || "Traveller" }));
}

/** One person by (part of) their name, or a question back when it's ambiguous. */
function pickPerson(people: Person[], name: string, scope: string): Person {
  const wanted = name.toLowerCase();
  const exact = people.filter((p) => p.name.toLowerCase() === wanted);
  const partial = exact.length ? exact : people.filter((p) => p.name.toLowerCase().includes(wanted));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new ActionError(`I found ${partial.length} ${scope} named ${name}: ${partial.slice(0, 5).map((p) => p.name).join(", ")}. Which one?`);
  }
  throw new ActionError(`I couldn't find anyone named "${name}" among your ${scope}.`);
}

async function findFriend(userId: string, name: string): Promise<Person> {
  if (!name) throw new ActionError("Who should I send it to?");
  return pickPerson(await friendsOf(userId), name, "friends");
}

async function findTraveller(userId: string, name: string): Promise<Person> {
  if (!name) throw new ActionError("Who are you looking for?");
  const { data, error } = await supabase
    .from("profiles").select("id, name").ilike("name", `%${name.replace(/[%_]/g, "")}%`).neq("id", userId).limit(10);
  if (error) throw error;
  return pickPerson((data ?? []).map((p) => ({ id: p.id, name: p.name || "Traveller" })), name, "travellers");
}

// ── Expenses ─────────────────────────────────────────────────────────────────

/** Must match the group_expenses.category CHECK constraint (see TripMoneyExpenses). */
const EXPENSE_CATEGORIES = ["food", "transport", "activity", "accommodation", "shopping", "general"] as const;
const EXPENSE_ALIASES: Record<string, (typeof EXPENSE_CATEGORIES)[number]> = {
  dinner: "food", lunch: "food", breakfast: "food", meal: "food", drinks: "food", cafe: "food", restaurant: "food",
  taxi: "transport", cab: "transport", uber: "transport", ola: "transport", fuel: "transport", petrol: "transport",
  train: "transport", bus: "transport", flight: "transport", auto: "transport", rickshaw: "transport",
  hotel: "accommodation", stay: "accommodation", hostel: "accommodation", room: "accommodation",
  tickets: "activity", ticket: "activity", entry: "activity", tour: "activity", attraction: "activity",
  souvenir: "shopping", souvenirs: "shopping", gifts: "shopping",
};

function expenseCategory(raw: unknown, title: string): (typeof EXPENSE_CATEGORIES)[number] {
  const wanted = str(raw).toLowerCase();
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(wanted)) return wanted as (typeof EXPENSE_CATEGORIES)[number];
  for (const word of `${wanted} ${title.toLowerCase()}`.split(/\W+/)) {
    if (EXPENSE_ALIASES[word]) return EXPENSE_ALIASES[word];
  }
  return "general";
}

// ── Activities ───────────────────────────────────────────────────────────────

const ACTIVITY_CATEGORIES = ["food", "attraction", "transport", "shopping", "accommodation", "other"];

/** Resolve "day 2" or an explicit date against the trip's dates. */
function activityDate(args: ActionArgs, trip: TripRow): string {
  const date = str(args.date);
  if (validIso(date)) return date;
  const day = num(args.day);
  if (day && day >= 1) {
    const d = parseLocalDate(trip.start_date);
    d.setDate(d.getDate() + Math.round(day) - 1);
    return formatLocalDate(d);
  }
  return trip.start_date;
}

function clockTime(value: unknown, fallback: string): string {
  const raw = str(value).toLowerCase();
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return fallback;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (m[3] === "pm" && hour < 12) hour += 12;
  if (m[3] === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ── Confirmation phrasing ────────────────────────────────────────────────────

/** "yes", "yeah do it", "haan", "go ahead" — a clear go-ahead to a question. */
export function isAffirmative(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 8 || /\b(no|not|don'?t|wait|cancel|stop)\b/.test(t)) return false;
  return /^(yes|yeah|yep|yup|ya|yah|sure|ok|okay|confirm|confirmed|do it|go ahead|go for it|please do|correct|right|absolutely|definitely|of course|haan|ha|han|ji|haan ji)\b/.test(t);
}

/** "no", "cancel", "never mind", "don't" — a clear refusal. */
export function isNegative(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 8) return false;
  return /^(no|nope|nah|na|don'?t|do not|cancel|stop|never ?mind|wait|not now|leave it|forget it|nahi)\b/.test(t);
}

// ── The actions ──────────────────────────────────────────────────────────────

export const JINNY_ACTIONS: Record<string, JinnyActionSpec> = {
  add_expense: {
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const trip = await resolveTrip(args, ctx);
      const title = str(args.title ?? args.description, 120);
      const amount = num(args.amount);
      if (!title) throw new ActionError("What was the expense for?");
      if (!amount || amount <= 0) throw new ActionError("How much was it?");
      const members = await tripMemberIds(trip.id);
      const currency = normalizeCurrencyCode(str(args.currency) || trip.currency || "INR");
      const row = {
        id: newId(),
        trip_id: trip.id,
        paid_by: userId, // RLS only allows logging what you paid yourself
        title,
        amount: Math.round(amount * 100) / 100,
        currency,
        category: expenseCategory(args.category, title),
        split_type: "equal",
        split_with: members.length ? members : [userId],
      };
      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase.from("group_expenses").insert(row);
          if (error) throw error;
        },
        { table: "group_expenses", action: "insert", payload: row, matchValue: row.id, description: `Add expense "${title}"`, invalidate: [["group-expenses", trip.id]] },
      );
      ctx.invalidate(["group-expenses", trip.id]);
      ctx.invalidate(["trip-budgets"]);
      return `Logged ${formatMoney(row.amount, currency)} for "${title}" (${row.category}) on ${trip.name}, paid by you and split equally between ${row.split_with.length} ${row.split_with.length === 1 ? "person" : "people"}.${result.queued ? " You're offline, so it will sync when you reconnect." : ""}`;
    },
  },

  list_expenses: {
    async run(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      const { data, error } = await supabase
        .from("group_expenses").select("title, amount, currency, category, created_at")
        .eq("trip_id", trip.id).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      if (!data?.length) return `No expenses are logged for ${trip.name} yet.`;
      return `Latest expenses on ${trip.name}:\n${data.map((e) => `- ${e.title}: ${formatMoney(Number(e.amount), e.currency)} (${e.category})`).join("\n")}`;
    },
  },

  delete_expense: {
    async confirm(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      return `Delete the expense "${str(args.title)}" from ${trip.name}?`;
    },
    async run(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      const title = str(args.title);
      const { data, error } = await supabase
        .from("group_expenses").select("id, title, amount, currency")
        .eq("trip_id", trip.id).ilike("title", `%${title.replace(/[%_]/g, "")}%`)
        .order("created_at", { ascending: false }).limit(2);
      if (error) throw error;
      if (!data?.length) throw new ActionError(`I couldn't find an expense called "${title}" on ${trip.name}.`);
      const expense = data[0];
      const { error: deleteError } = await supabase.from("group_expenses").delete().eq("id", expense.id);
      if (deleteError) throw deleteError;
      ctx.invalidate(["group-expenses", trip.id]);
      return `Deleted "${expense.title}" (${formatMoney(Number(expense.amount), expense.currency)}) from ${trip.name}.`;
    },
  },

  add_activity: {
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const trip = await resolveTrip(args, ctx);
      const name = str(args.name, 160);
      if (!name) throw new ActionError("What should I add to the plan?");
      const date = activityDate(args, trip);
      if (date < trip.start_date || date > trip.end_date) {
        throw new ActionError(`${date} is outside ${trip.name} (${trip.start_date} to ${trip.end_date}).`);
      }
      const start = clockTime(args.start_time ?? args.time, "10:00");
      const minutes = Math.min(14 * 60, Math.max(15, num(args.duration_minutes) ?? 90));
      const startAt = new Date(`${date}T${start}:00`);
      const endAt = new Date(startAt.getTime() + minutes * 60_000);
      const itineraryId = await latestItineraryId(trip.id, { userId });
      const category = ACTIVITY_CATEGORIES.includes(str(args.category)) ? str(args.category) : "attraction";
      const { error } = await supabase.from("activities").insert({
        itinerary_id: itineraryId!,
        name,
        description: str(args.description, 1200) || null,
        location_name: str(args.location_name ?? args.location, 200) || null,
        category,
        cost: Math.max(0, num(args.cost) ?? 0),
        notes: str(args.notes, 1200) || null,
        start_time: startAt.toISOString(),
        end_time: endAt.toISOString(),
        status: "pending",
      });
      if (error) throw error;
      ctx.invalidate(["activities", itineraryId]);
      ctx.invalidate(["itineraries", trip.id]);
      return `Added "${name}" to ${trip.name} on ${date} at ${start} for ${minutes} minutes.`;
    },
  },

  remove_activity: {
    async confirm(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      return `Remove "${str(args.name)}" from the ${trip.name} itinerary?`;
    },
    async run(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      const itineraryId = await latestItineraryId(trip.id, null);
      if (!itineraryId) throw new ActionError(`${trip.name} has no itinerary yet.`);
      const name = str(args.name);
      const { data, error } = await supabase
        .from("activities").select("id, name, start_time")
        .eq("itinerary_id", itineraryId).ilike("name", `%${name.replace(/[%_]/g, "")}%`).limit(3);
      if (error) throw error;
      if (!data?.length) throw new ActionError(`"${name}" isn't in the ${trip.name} plan.`);
      if (data.length > 1) throw new ActionError(`A few activities match "${name}": ${data.map((a) => a.name).join(", ")}. Which one?`);
      const { error: deleteError } = await supabase.from("activities").delete().eq("id", data[0].id);
      if (deleteError) throw deleteError;
      ctx.invalidate(["activities", itineraryId]);
      return `Removed "${data[0].name}" from ${trip.name}.`;
    },
  },

  update_trip: {
    async run(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      const patch: {
        name?: string; destination?: string; country?: string;
        start_date?: string; end_date?: string; budget_total?: number; currency?: string;
      } = {};
      const name = str(args.name, 120);
      const destination = str(args.destination, 120);
      const country = str(args.country, 100);
      const start = str(args.start_date);
      const end = str(args.end_date);
      const budget = args.budget === undefined ? null : num(args.budget);
      if (name) patch.name = name;
      if (destination) patch.destination = destination;
      if (country) patch.country = country;
      if (start) { if (!validIso(start)) throw new ActionError("The start date needs to be a real date."); patch.start_date = start; }
      if (end) { if (!validIso(end)) throw new ActionError("The end date needs to be a real date."); patch.end_date = end; }
      if (String(patch.end_date ?? trip.end_date) < String(patch.start_date ?? trip.start_date)) {
        throw new ActionError("The trip can't end before it starts.");
      }
      if (budget !== null) { if (budget < 0) throw new ActionError("The budget can't be negative."); patch.budget_total = budget; }
      if (str(args.currency)) patch.currency = normalizeCurrencyCode(str(args.currency));
      if (!Object.keys(patch).length) throw new ActionError("What would you like to change about the trip?");
      const { data, error } = await supabase.from("trips").update(patch).eq("id", trip.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new ActionError(`Only the organiser can change ${trip.name}.`);
      ctx.invalidate(["trips"]);
      ctx.invalidate(["trip", trip.id]);
      const changes = Object.entries(patch).map(([k, v]) =>
        k === "budget_total" ? `budget ${formatMoney(Number(v), String(patch.currency ?? trip.currency ?? "INR"))}` : `${k.replace("_", " ")} ${v}`);
      return `Updated ${trip.name}: ${changes.join(", ")}.`;
    },
  },

  delete_trip: {
    async confirm(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      return `Delete the trip "${trip.name}" and its whole itinerary? This can't be undone.`;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const trip = await resolveTrip(args, ctx);
      if (trip.organizer_id !== userId) throw new ActionError(`Only the organiser can delete ${trip.name}.`);
      const { error } = await supabase.from("trips").delete().eq("id", trip.id);
      if (error) throw error;
      ctx.invalidate(["trips"]);
      if (ctx.currentTripId === trip.id) ctx.navigate("/dashboard");
      return `Deleted the trip "${trip.name}".`;
    },
  },

  create_invite_link: {
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const trip = await resolveTrip(args, ctx);
      const { data, error } = await supabase
        .from("trip_invites").insert({ trip_id: trip.id, created_by: userId }).select("invite_code").single();
      if (error) throw error;
      const link = `${ctx.origin}/join/${data.invite_code}`;
      let copied = false;
      try { await navigator.clipboard?.writeText(link); copied = true; } catch { /* clipboard needs focus/permission */ }
      ctx.invalidate(["trip-invites"]);
      return `Created an invite link for ${trip.name}${copied ? " and copied it to your clipboard" : ""}: ${link} — people who open it can ask to join, and you approve them.`;
    },
  },

  add_friend_to_trip: {
    async confirm(args, ctx) {
      const userId = requireUser(ctx);
      const friend = await findFriend(userId, str(args.friend_name ?? args.name));
      const trip = await resolveTrip(args, ctx);
      return `Add ${friend.name} to ${trip.name}? They'll be able to see and edit the plan.`;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const friend = await findFriend(userId, str(args.friend_name ?? args.name));
      const trip = await resolveTrip(args, ctx);
      const { error } = await supabase.from("trip_memberships").insert({ trip_id: trip.id, user_id: friend.id, role: "member" });
      if (error?.code === "23505") return `${friend.name} is already on ${trip.name}.`;
      if (error) throw error;
      ctx.invalidate(["trip-members"]);
      ctx.invalidate(["trip-memberships"]);
      return `Added ${friend.name} to ${trip.name}.`;
    },
  },

  send_trip_message: {
    async confirm(args, ctx) {
      const trip = await resolveTrip(args, ctx);
      return `Send "${str(args.text, 200)}" to the ${trip.name} group chat?`;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const trip = await resolveTrip(args, ctx);
      const text = str(args.text, 2000);
      if (!text) throw new ActionError("What should the message say?");
      const row = { id: newId(), trip_id: trip.id, sender_id: userId, content: text, message_type: "text" };
      const result = await mutateWithOfflineQueue(
        async () => {
          const { error } = await supabase.from("messages").insert(row);
          if (error) throw error;
        },
        { table: "messages", action: "insert", payload: row, matchValue: row.id, description: "Send chat message", invalidate: [["messages", trip.id]] },
      );
      return `${result.queued ? "Queued" : "Sent"} your message to the ${trip.name} group chat.`;
    },
  },

  send_direct_message: {
    async confirm(args, ctx) {
      const friend = await findFriend(requireUser(ctx), str(args.to ?? args.friend_name));
      return `Send ${friend.name} the message "${str(args.text, 200)}"?`;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const friend = await findFriend(userId, str(args.to ?? args.friend_name));
      const text = str(args.text, 2000);
      if (!text) throw new ActionError("What should the message say?");
      const { error } = await supabase.from("direct_messages").insert({ sender_id: userId, receiver_id: friend.id, content: text, read: false });
      if (error) throw error;
      return `Sent ${friend.name} your message.`;
    },
  },

  send_friend_request: {
    async confirm(args, ctx) {
      const person = await findTraveller(requireUser(ctx), str(args.name));
      return `Send a friend request to ${person.name}?`;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const person = await findTraveller(userId, str(args.name));
      const { error } = await supabase.from("friend_requests").insert({ sender_id: userId, receiver_id: person.id, status: "pending" });
      if (error?.code === "23505") return `You've already sent ${person.name} a request.`;
      if (error) throw error;
      ctx.invalidate(["friend-requests"]);
      return `Sent ${person.name} a friend request.`;
    },
  },

  respond_friend_request: {
    async confirm(args) {
      return args.accept === false ? `Decline the friend request from ${str(args.name)}?` : null;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const accept = args.accept !== false;
      const { data, error } = await supabase
        .from("friend_requests").select("id, sender_id").eq("receiver_id", userId).eq("status", "pending");
      if (error) throw error;
      if (!data?.length) throw new ActionError("You have no pending friend requests.");
      const { data: senders } = await supabase.from("profiles").select("id, name").in("id", data.map((r) => r.sender_id));
      const people = (senders ?? []).map((p) => ({ id: p.id, name: p.name || "Traveller" }));
      const person = str(args.name) ? pickPerson(people, str(args.name), "pending requests") : people.length === 1 ? people[0] : null;
      if (!person) throw new ActionError(`Requests are waiting from ${people.map((p) => p.name).join(", ")}. Whose should I ${accept ? "accept" : "decline"}?`);
      const request = data.find((r) => r.sender_id === person.id)!;
      const { error: updateError } = await supabase
        .from("friend_requests").update({ status: accept ? "accepted" : "rejected" }).eq("id", request.id);
      if (updateError) throw updateError;
      ctx.invalidate(["friend-requests"]);
      return accept ? `You and ${person.name} are now friends.` : `Declined ${person.name}'s request.`;
    },
  },

  join_community: {
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const name = str(args.name);
      const { data, error } = await supabase
        .from("communities").select("id, name").ilike("name", `%${name.replace(/[%_]/g, "")}%`).eq("is_public", true).limit(5);
      if (error) throw error;
      const community = pickCommunity(data ?? [], name);
      const { error: joinError } = await supabase.from("community_memberships").insert({ community_id: community.id, user_id: userId });
      if (joinError?.code === "23505") return `You're already in ${community.name}.`;
      if (joinError) throw joinError;
      ctx.invalidate(["communities"]);
      ctx.invalidate(["my-community-memberships"]);
      return `Joined ${community.name}.`;
    },
  },

  leave_community: {
    async confirm(args) {
      return `Leave the community "${str(args.name)}"?`;
    },
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const name = str(args.name);
      const { data, error } = await supabase
        .from("community_memberships").select("community_id, communities(name)").eq("user_id", userId);
      if (error) throw error;
      const mine = (data ?? []).map((m) => ({ id: m.community_id as string, name: (m.communities as { name?: string } | null)?.name ?? "" }));
      const community = pickCommunity(mine.filter((c) => c.name.toLowerCase().includes(name.toLowerCase())), name);
      const { error: leaveError } = await supabase
        .from("community_memberships").delete().eq("community_id", community.id).eq("user_id", userId);
      if (leaveError) throw leaveError;
      ctx.invalidate(["communities"]);
      ctx.invalidate(["my-community-memberships"]);
      return `Left ${community.name}.`;
    },
  },

  update_preferences: {
    async run(args, ctx) {
      const userId = requireUser(ctx);
      const { data: profile, error } = await supabase.from("profiles").select("preferences").eq("id", userId).single();
      if (error) throw error;
      const draft = draftFromPreferences(profile?.preferences);
      const changes: string[] = [];
      const pace = normalisePace(args.pace);
      if (pace) { draft.pace = pace; changes.push(`pace ${pace}`); }
      const ceiling = args.budget_ceiling === undefined ? null : num(args.budget_ceiling);
      if (ceiling !== null) { draft.budgetCeiling = ceiling > 0 ? ceiling : null; changes.push(ceiling > 0 ? `budget cap ${ceiling}` : "no budget cap"); }
      const asCategories = (value: unknown) => (Array.isArray(value) ? value : [value])
        .map((v) => str(v).toLowerCase())
        .map((v) => (v === "nightlife" || v === "adventure" ? "entertainment" : v === "sightseeing" || v === "culture" || v === "nature" ? "attraction" : v === "markets" ? "shopping" : v))
        .filter((v): v is ActivityCategory => (EDITABLE_CATEGORIES as readonly string[]).includes(v));
      for (const c of asCategories(args.likes)) { draft.categoryWeights[c] = 0.9; changes.push(`likes ${c}`); }
      for (const c of asCategories(args.dislikes)) { draft.categoryWeights[c] = 0.1; changes.push(`not keen on ${c}`); }
      if (!changes.length) throw new ActionError("Tell me what to change: your pace, a budget cap, or what you like or dislike.");
      const preferences = preferencesPatch(draft, profile?.preferences);
      const { error: saveError } = await supabase.from("profiles").update({ preferences: preferences as never }).eq("id", userId);
      if (saveError) throw saveError;
      ctx.invalidate(["profile"]);
      return `Saved your travel preferences: ${changes.join(", ")}. New plans will be scored against them.`;
    },
  },
};

function pickCommunity<T extends { id: string; name: string }>(list: T[], name: string): T {
  if (!name) throw new ActionError("Which community?");
  const exact = list.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  const options = exact.length ? exact : list;
  if (options.length === 1) return options[0];
  if (options.length > 1) throw new ActionError(`A few communities match "${name}": ${options.map((c) => c.name).join(", ")}. Which one?`);
  throw new ActionError(`I couldn't find a community called "${name}".`);
}
