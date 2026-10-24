// ─────────────────────────────────────────────────────────────────────────────
// Trip budget loader
// ─────────────────────────────────────────────────────────────────────────────
// Fetches what lib/budget.ts needs for one or more trips — the latest
// itinerary's activity costs, logged expenses and member count — and returns
// the same summary the Trip Money panel shows.
//
// The AI assistant used to be told to "emit budget_alert with real numbers"
// without ever being given the expenses, so it made them up (often copying
// the example figures from its own prompt). It now reads these instead.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { summarizeBudget, type BudgetSummary, type ExpenseItem } from "@/lib/budget";
import { normalizeCurrencyCode } from "@/lib/currency";
import { tripDayCount } from "@/lib/date";

export interface TripBudgetInput {
  id: string;
  budget_total?: number | string | null;
  currency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface TripBudget {
  tripId: string;
  currency: string;
  summary: BudgetSummary;
}

/** Budget summaries keyed by trip id. Trips whose data fails to load are omitted. */
export async function loadTripBudgets(
  trips: ReadonlyArray<TripBudgetInput>,
): Promise<Map<string, TripBudget>> {
  const out = new Map<string, TripBudget>();
  const ids = trips.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return out;

  const [itinRes, expenseRes, memberRes] = await Promise.all([
    supabase
      .from("itineraries")
      .select("id, trip_id, version")
      .in("trip_id", ids)
      .order("version", { ascending: false }),
    supabase
      .from("group_expenses")
      .select("trip_id, paid_by, amount, category, split_with")
      .in("trip_id", ids),
    supabase.from("trip_memberships").select("trip_id").in("trip_id", ids),
  ]);
  if (itinRes.error || expenseRes.error) return out;

  // Same rule as the itinerary page: the highest version is the active plan.
  const latestItinerary = new Map<string, string>();
  for (const row of itinRes.data ?? []) {
    if (!latestItinerary.has(row.trip_id)) latestItinerary.set(row.trip_id, row.id);
  }

  const activitiesByItinerary = new Map<string, Array<{ cost: unknown; category: string | null }>>();
  const itineraryIds = [...latestItinerary.values()];
  if (itineraryIds.length > 0) {
    const { data, error } = await supabase
      .from("activities")
      .select("itinerary_id, cost, category")
      .in("itinerary_id", itineraryIds);
    if (error) return out;
    for (const a of data ?? []) {
      const list = activitiesByItinerary.get(a.itinerary_id) ?? [];
      list.push({ cost: a.cost, category: a.category });
      activitiesByItinerary.set(a.itinerary_id, list);
    }
  }

  const expensesByTrip = new Map<string, ExpenseItem[]>();
  for (const e of expenseRes.data ?? []) {
    const list = expensesByTrip.get(e.trip_id) ?? [];
    list.push(e);
    expensesByTrip.set(e.trip_id, list);
  }

  const membersByTrip = new Map<string, number>();
  for (const m of memberRes.data ?? []) {
    membersByTrip.set(m.trip_id, (membersByTrip.get(m.trip_id) ?? 0) + 1);
  }

  for (const trip of trips) {
    const itineraryId = latestItinerary.get(trip.id);
    out.set(trip.id, {
      tripId: trip.id,
      currency: normalizeCurrencyCode(trip.currency),
      summary: summarizeBudget({
        budget: trip.budget_total,
        activities: itineraryId ? activitiesByItinerary.get(itineraryId) : [],
        expenses: expensesByTrip.get(trip.id) ?? [],
        travelers: membersByTrip.get(trip.id) ?? 1,
        days:
          trip.start_date && trip.end_date
            ? tripDayCount(trip.start_date, trip.end_date)
            : 1,
      }),
    });
  }
  return out;
}
