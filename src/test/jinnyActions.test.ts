import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny chainable stand-in for the Supabase query builder. Each table gets a
// canned result; inserts are recorded so the exact row can be asserted.
const inserted: Array<{ table: string; row: unknown }> = [];
const tables: Record<string, unknown> = {};

function builder(table: string) {
  const result = () => Promise.resolve({ data: tables[table] ?? null, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "or", "ilike", "gte", "order", "limit", "in", "is", "update", "delete"]) {
    chain[method] = () => chain;
  }
  chain.insert = (row: unknown) => {
    inserted.push({ table, row });
    return chain;
  };
  chain.maybeSingle = () => result().then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }));
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
  isSupabaseConfigured: true,
}));
vi.mock("@/lib/offlineMutation", () => ({
  newId: () => "00000000-0000-4000-8000-000000000001",
  mutateWithOfflineQueue: async (run: () => Promise<void>) => {
    await run();
    return { queued: false };
  },
}));

import { classifyIntent } from "@/services/aiChat";
import { JINNY_ACTIONS, isAffirmative, isNegative, type JinnyActionContext } from "@/services/jinnyActions";

const GOA = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Goa Getaway",
  destination: "Goa",
  start_date: "2026-12-20",
  end_date: "2026-12-24",
  currency: "INR",
  budget_total: 40000,
  organizer_id: "me",
};

function ctx(overrides: Partial<JinnyActionContext> = {}): JinnyActionContext {
  return {
    userId: "me",
    currentTripId: GOA.id,
    origin: "https://app.example",
    invalidate: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}

describe("confirmation replies", () => {
  it.each(["yes", "Yeah, do it", "go ahead", "haan", "ok confirm"])("%j is a yes", (said) => {
    expect(isAffirmative(said)).toBe(true);
    expect(isNegative(said)).toBe(false);
  });
  it.each(["no", "nope", "don't", "cancel that", "wait"])("%j is a no", (said) => {
    expect(isNegative(said)).toBe(true);
    expect(isAffirmative(said)).toBe(false);
  });
  it("treats a fresh request as neither", () => {
    expect(isAffirmative("add dinner for 2000 to the Goa trip and then tell me the total")).toBe(false);
    expect(isNegative("show me hotels in Goa")).toBe(false);
  });
});

describe("intent routing for app commands", () => {
  it.each([
    "add a 500 rupee lunch expense",
    "I just paid 1200 for the cab",
    "delete my Goa trip",
    "invite Priya to my Goa trip",
    "click the generate button",
    "change the language to Hindi",
    "export the itinerary as pdf",
  ])("%j is APP_CONTROL", (said) => {
    expect(classifyIntent(said)).toBe("APP_CONTROL");
  });

  it("leaves questions about money with the budget intent", () => {
    expect(classifyIntent("how much have I spent on Goa?")).toBe("BUDGET_ANALYSIS");
  });
});

describe("typed actions", () => {
  beforeEach(() => {
    inserted.length = 0;
    for (const key of Object.keys(tables)) delete tables[key];
    tables.trips = [GOA];
    tables.trip_memberships = [{ user_id: "me" }, { user_id: "priya" }];
  });

  it("add_expense writes the same row the Trip Money form would", async () => {
    const result = await JINNY_ACTIONS.add_expense.run({ title: "Dinner at Thalassa", amount: "2,400" }, ctx());
    expect(inserted).toEqual([
      {
        table: "group_expenses",
        row: expect.objectContaining({
          trip_id: GOA.id,
          paid_by: "me",
          title: "Dinner at Thalassa",
          amount: 2400,
          currency: "INR",
          category: "food",
          split_type: "equal",
          split_with: ["me", "priya"],
        }),
      },
    ]);
    expect(result).toMatch(/Dinner at Thalassa/);
    expect(result).toMatch(/2 people/);
  });

  it("add_expense asks for what is missing rather than guessing", async () => {
    await expect(JINNY_ACTIONS.add_expense.run({ title: "Taxi" }, ctx())).rejects.toThrow(/How much/);
    expect(inserted).toEqual([]);
  });

  it("add_activity places 'day 2' on the trip's second date and rejects dates outside the trip", async () => {
    tables.itineraries = [{ id: "itin-1" }];
    await JINNY_ACTIONS.add_activity.run({ name: "Chapora Fort", day: 2, start_time: "5:30 pm" }, ctx());
    const row = inserted.find((i) => i.table === "activities")?.row as { start_time: string; name: string };
    expect(row.name).toBe("Chapora Fort");
    const start = new Date(row.start_time);
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()]).toEqual([2026, 12, 21, 17, 30]);

    await expect(JINNY_ACTIONS.add_activity.run({ name: "Late night", date: "2027-01-05" }, ctx())).rejects.toThrow(/outside/);
  });

  it("destructive actions declare a confirmation question", async () => {
    expect(await JINNY_ACTIONS.delete_trip.confirm!({}, ctx())).toMatch(/Delete the trip "Goa Getaway"/);
    expect(await JINNY_ACTIONS.send_trip_message.confirm!({ text: "See you at 6" }, ctx())).toMatch(/Send "See you at 6"/);
    expect(JINNY_ACTIONS.add_expense.confirm).toBeUndefined();
  });

  it("only the organiser can delete a trip", async () => {
    tables.trips = [{ ...GOA, organizer_id: "someone-else" }];
    await expect(JINNY_ACTIONS.delete_trip.run({}, ctx())).rejects.toThrow(/Only the organiser/);
  });
});
