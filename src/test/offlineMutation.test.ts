import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isRetriableFailure,
  mutateWithOfflineQueue,
  pendingMutationCount,
  syncQueuedMutations,
  type MutationClient,
} from "@/lib/offlineMutation";
import { clearAllData } from "@/lib/idb";

// ── Test doubles ────────────────────────────────────────────────────────────

/** Records every write so replay order and payloads can be asserted. */
function fakeClient(behaviour: { failWith?: unknown } = {}) {
  const calls: Array<{
    table: string;
    action: string;
    values?: Record<string, unknown>;
    column?: string;
    value?: unknown;
  }> = [];

  const client: MutationClient = {
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          calls.push({ table, action: "insert", values });
          return Promise.resolve({ error: behaviour.failWith ?? null });
        },
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              calls.push({ table, action: "update", values, column, value });
              return Promise.resolve({ error: behaviour.failWith ?? null });
            },
          };
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              calls.push({ table, action: "delete", column, value });
              return Promise.resolve({ error: behaviour.failWith ?? null });
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    configurable: true,
    writable: true,
  });
}

const originalOnLine = navigator.onLine;

beforeEach(async () => {
  setOnline(true);
  await clearAllData();
});

afterEach(() => {
  setOnline(originalOnLine);
});

// ── Failure classification ──────────────────────────────────────────────────

describe("isRetriableFailure", () => {
  it("treats anything as retriable while offline", () => {
    setOnline(false);
    expect(isRetriableFailure(new Error("permission denied"))).toBe(true);
  });

  it("treats network failures as retriable", () => {
    for (const message of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      "Load failed",
      "request timeout",
    ]) {
      expect(isRetriableFailure(new Error(message))).toBe(true);
    }
  });

  it("treats a PostgREST rejection code as permanent", () => {
    // An RLS denial or constraint violation will never succeed on replay.
    expect(isRetriableFailure({ code: "42501", message: "denied" })).toBe(false);
    expect(isRetriableFailure({ code: "23505", message: "duplicate" })).toBe(false);
  });

  it("treats connection-class Postgres codes as retriable", () => {
    expect(isRetriableFailure({ code: "08006", message: "conn failure" })).toBe(true);
    expect(isRetriableFailure({ code: "57P03", message: "starting up" })).toBe(true);
  });

  it("does not retry an unrecognised error while online", () => {
    expect(isRetriableFailure(new Error("something odd"))).toBe(false);
  });
});

// ── Wrapper behaviour ───────────────────────────────────────────────────────

describe("mutateWithOfflineQueue", () => {
  const spec = {
    table: "activities",
    action: "update" as const,
    payload: { status: "done" },
    matchValue: "act-1",
  };

  it("runs the write directly when online and succeeding", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const result = await mutateWithOfflineQueue(run, spec);

    expect(run).toHaveBeenCalledOnce();
    expect(result.synced).toBe(true);
    expect(result.queued).toBe(false);
    expect(await pendingMutationCount()).toBe(0);
  });

  it("queues without attempting the write when offline", async () => {
    setOnline(false);
    const run = vi.fn();
    const result = await mutateWithOfflineQueue(run, spec);

    // Skipping the doomed network call avoids a pointless timeout.
    expect(run).not.toHaveBeenCalled();
    expect(result.queued).toBe(true);
    expect(await pendingMutationCount()).toBe(1);
  });

  it("queues when the write fails for a network reason", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const result = await mutateWithOfflineQueue(run, spec);

    expect(result.queued).toBe(true);
    expect(await pendingMutationCount()).toBe(1);
  });

  it("rethrows a permanent rejection instead of queueing it", async () => {
    const run = vi.fn().mockRejectedValue({ code: "42501", message: "denied" });

    await expect(mutateWithOfflineQueue(run, spec)).rejects.toBeDefined();
    expect(await pendingMutationCount()).toBe(0);
  });

  it("accumulates multiple offline edits", async () => {
    setOnline(false);
    for (const id of ["a", "b", "c"]) {
      await mutateWithOfflineQueue(vi.fn(), { ...spec, matchValue: id });
    }
    expect(await pendingMutationCount()).toBe(3);
  });
});

// ── Replay ──────────────────────────────────────────────────────────────────

describe("syncQueuedMutations", () => {
  it("does nothing when the queue is empty", async () => {
    const { client, calls } = fakeClient();
    const outcome = await syncQueuedMutations(client);

    expect(outcome.attempted).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("replays a queued update against the server", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "update",
      payload: { status: "done" },
      matchValue: "act-1",
    });

    setOnline(true);
    const { client, calls } = fakeClient();
    const outcome = await syncQueuedMutations(client);

    expect(outcome.succeeded).toBe(1);
    expect(calls).toEqual([
      {
        table: "activities",
        action: "update",
        values: { status: "done" },
        column: "id",
        value: "act-1",
      },
    ]);
    expect(await pendingMutationCount()).toBe(0);
  });

  it("replays inserts and deletes with the right shape", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "messages",
      action: "insert",
      payload: { content: "hi" },
    });
    await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "delete",
      payload: {},
      matchValue: "act-9",
    });

    setOnline(true);
    const { client, calls } = fakeClient();
    await syncQueuedMutations(client);

    expect(calls.map((c) => c.action)).toEqual(["insert", "delete"]);
    expect(calls[1].value).toBe("act-9");
  });

  it("honours a custom match column", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "trip_memberships",
      action: "delete",
      payload: {},
      matchColumn: "user_id",
      matchValue: "user-3",
    });

    setOnline(true);
    const { client, calls } = fakeClient();
    await syncQueuedMutations(client);

    expect(calls[0].column).toBe("user_id");
  });

  it("collects invalidation keys from successful replays", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "update",
      payload: { status: "done" },
      matchValue: "act-1",
      invalidate: [["activities"], ["itineraries", "trip-1"]],
    });

    setOnline(true);
    const { client } = fakeClient();
    const outcome = await syncQueuedMutations(client);

    expect(outcome.invalidate).toEqual([["activities"], ["itineraries", "trip-1"]]);
  });

  it("marks a permanently rejected mutation as failed and moves on", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "update",
      payload: { status: "done" },
      matchValue: "act-1",
    });

    setOnline(true);
    const { client } = fakeClient({ failWith: { code: "42501" } });
    const outcome = await syncQueuedMutations(client);

    expect(outcome.failed).toBe(1);
    expect(outcome.succeeded).toBe(0);
    // Cleared from pending so it cannot block the queue forever.
    expect(await pendingMutationCount()).toBe(0);
  });

  it("stops on a transient failure so ordering survives", async () => {
    setOnline(false);
    for (const id of ["a", "b"]) {
      await mutateWithOfflineQueue(vi.fn(), {
        table: "activities",
        action: "update",
        payload: { status: "done" },
        matchValue: id,
      });
    }

    setOnline(true);
    const { client, calls } = fakeClient({
      failWith: new Error("Failed to fetch"),
    });
    const outcome = await syncQueuedMutations(client);

    // First attempt fails transiently → bail, leaving both queued.
    expect(outcome.succeeded).toBe(0);
    expect(calls).toHaveLength(1);
    expect(await pendingMutationCount()).toBe(2);
  });

  it("replays in FIFO order even when queued within the same millisecond", async () => {
    // Regression guard. Ordering originally sorted on `createdAt`, which is
    // millisecond-precision, so a burst of edits replayed in arbitrary index
    // order — wrong for a queue where an insert must precede its update.
    setOnline(false);
    for (let i = 0; i < 12; i++) {
      await mutateWithOfflineQueue(vi.fn(), {
        table: "activities",
        action: "update",
        payload: { order: i },
        matchValue: `act-${i}`,
      });
    }

    setOnline(true);
    const { client, calls } = fakeClient();
    await syncQueuedMutations(client);

    expect(calls).toHaveLength(12);
    expect(calls.map((c) => c.value)).toEqual(
      Array.from({ length: 12 }, (_, i) => `act-${i}`),
    );
  });

  it("keeps ordering stable across mixed actions", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "messages",
      action: "insert",
      payload: { content: "first" },
    });
    await mutateWithOfflineQueue(vi.fn(), {
      table: "messages",
      action: "update",
      payload: { content: "edited" },
      matchValue: "msg-1",
    });
    await mutateWithOfflineQueue(vi.fn(), {
      table: "messages",
      action: "delete",
      payload: {},
      matchValue: "msg-1",
    });

    setOnline(true);
    const { client, calls } = fakeClient();
    await syncQueuedMutations(client);

    expect(calls.map((c) => c.action)).toEqual(["insert", "update", "delete"]);
  });

  it("shares one run between concurrent callers", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "update",
      payload: { status: "done" },
      matchValue: "act-1",
    });

    setOnline(true);
    const { client, calls } = fakeClient();

    // A reconnect event and a manual retry firing together must not double-apply.
    const [a, b] = await Promise.all([
      syncQueuedMutations(client),
      syncQueuedMutations(client),
    ]);

    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
  });

  it("does not attempt anything while still offline", async () => {
    setOnline(false);
    await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "update",
      payload: { status: "done" },
      matchValue: "act-1",
    });

    const { client, calls } = fakeClient({
      failWith: new Error("Failed to fetch"),
    });
    await syncQueuedMutations(client);

    expect(calls.length).toBeLessThanOrEqual(1);
    expect(await pendingMutationCount()).toBe(1);
  });
});

// ── End-to-end ──────────────────────────────────────────────────────────────

describe("offline edit round trip", () => {
  it("preserves an edit made offline and applies it on reconnect", async () => {
    // The scenario this module exists for: edit with no signal, reconnect later.
    setOnline(false);
    const result = await mutateWithOfflineQueue(vi.fn(), {
      table: "activities",
      action: "update",
      payload: { name: "Sunset at Anjuna", cost: 0 },
      matchValue: "act-42",
      description: "Rename activity",
      invalidate: [["activities"]],
    });
    expect(result.queued).toBe(true);
    expect(await pendingMutationCount()).toBe(1);

    setOnline(true);
    const { client, calls } = fakeClient();
    const outcome = await syncQueuedMutations(client);

    expect(outcome.succeeded).toBe(1);
    expect(calls[0].values).toEqual({ name: "Sunset at Anjuna", cost: 0 });
    expect(await pendingMutationCount()).toBe(0);
  });
});
