// ─────────────────────────────────────────────────────────────────────────────
// Offline-tolerant mutations
// ─────────────────────────────────────────────────────────────────────────────
// Reads already survive going offline: trips, itineraries and activities are
// persisted in IndexedDB and map tiles in the Cache API. Writes did not — an
// edit made with no signal was attempted, failed, and was discarded, so the
// user's change vanished with only a toast to show for it.
//
// This module closes that gap with one wrapper. Callers keep writing ordinary
// Supabase queries; when the device is offline (or the write fails for a
// network reason) the intent is recorded in the durable `offlineQueue`
// IndexedDB store and replayed on reconnect.
//
// Concurrency: an update may carry `expectedUpdatedAt`, the `updated_at` value
// the client last saw. Replay then matches on it as well as the row id, so a row
// someone else has changed in the meantime rejects the stale write and is
// reported as a conflict instead of silently overwriting their edit. Without the
// precondition, replay is last-write-wins.
//
// Deliberate limits, stated rather than hidden:
//   • Conflict resolution is detect-and-report, not merge. The losing write is
//     kept in the queue log as `conflict` and surfaced; it is not replayed, and
//     no attempt is made to reconcile field-by-field.
//   • The precondition only works on tables carrying `updated_at`. A caller that
//     omits `expectedUpdatedAt` still gets last-write-wins.
//   • Only network failures queue. A rejected write (RLS denial, constraint
//     violation) is a real error and is surfaced immediately.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getOfflineQueue,
  saveToOfflineQueue,
  updateOfflineQueue,
  type StoredRecord,
} from "./idb";

export type QueuedAction = "insert" | "update" | "delete";

export interface QueuedMutation extends StoredRecord {
  /**
   * Strictly increasing sequence number. Ordering must be FIFO — an insert
   * followed by an update to the same row has to replay in that order — and
   * `createdAt` is only millisecond-precision, so two mutations queued in the
   * same tick would replay in arbitrary index order.
   */
  seq: number;
  /** Supabase table name. */
  table: string;
  action: QueuedAction;
  /** Row payload for insert/update. Empty for delete. */
  payload: Record<string, unknown>;
  /** Column to match on for update/delete. Defaults to "id". */
  matchColumn?: string;
  /** Value to match. Required for update/delete. */
  matchValue?: string;
  /**
   * The `updated_at` value this client last saw on the target row.
   *
   * When set, replay adds it to the match so the write only lands if nobody has
   * touched the row since. Omit it — or pass a table with no `updated_at`
   * column — and replay falls back to last-write-wins.
   */
  expectedUpdatedAt?: string;
  /** Short human-readable description, for the pending-changes UI. */
  description?: string;
  /** Query keys to invalidate once this replays successfully. */
  invalidate?: string[][];
}

export interface OfflineMutationResult<T> {
  /** True when the write reached the server. */
  synced: boolean;
  /** True when the write was queued for later. */
  queued: boolean;
  /** Server response, only present when `synced`. */
  data?: T;
}

/**
 * Minimal table-level surface this module needs.
 *
 * Deliberately loose. Supabase's generated client is generic over the whole
 * schema, and matching it structurally makes TypeScript recurse until it gives
 * up ("Type instantiation is excessively deep"). `adaptClient` below is the one
 * place that cast happens, so the looseness stays contained rather than
 * spreading into callers.
 */
interface TableWriter {
  insert(values: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  update(values: Record<string, unknown>): WriteFilter;
  delete(): WriteFilter;
}

/**
 * Chainable filter. Awaiting it runs the write; `select` runs it and returns the
 * affected rows, which is the only way to tell "matched nothing" from "matched
 * and succeeded" — PostgREST reports both as success with no error.
 */
interface WriteFilter extends PromiseLike<{ error: unknown }> {
  eq(column: string, value: unknown): WriteFilter;
  select(columns: string): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

export interface MutationClient {
  from(table: string): TableWriter;
}

/**
 * A replayed write whose precondition no longer held: the target row was changed
 * or removed by someone else after this mutation was queued.
 *
 * Not a failure — the request was valid and the server was reachable. Retrying
 * would either do nothing or overwrite the other person's work, so the mutation
 * is retired and reported instead.
 */
export class MutationConflictError extends Error {
  readonly table: string;
  readonly matchValue?: string;
  /** What the user was trying to change, for the message shown to them. */
  readonly description?: string;

  constructor(mutation: QueuedMutation) {
    super(
      `${mutation.description ?? `${mutation.action} on ${mutation.table}`} ` +
        `could not be applied: the record changed after the edit was queued.`,
    );
    this.name = "MutationConflictError";
    this.table = mutation.table;
    this.matchValue = mutation.matchValue;
    this.description = mutation.description;
  }
}

/**
 * Narrows a Supabase client to the write surface used here. Replay works on
 * runtime table names read back from IndexedDB, which the generated types
 * cannot know about anyway.
 */
export function adaptClient(client: unknown): MutationClient {
  return client as MutationClient;
}

// ── Failure classification ──────────────────────────────────────────────────

/**
 * Whether a failure is worth queueing. Network and fetch-layer failures are
 * transient; anything the server actively rejected is not, and queueing it
 * would replay a doomed write forever.
 */
export function isRetriableFailure(error: unknown): boolean {
  // A lost precondition is terminal regardless of connectivity: replaying it
  // would overwrite whoever won the race.
  if (error instanceof MutationConflictError) return false;
  if (!navigator.onLine) return true;
  if (!error) return false;

  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  // Supabase surfaces PostgREST rejections with a code; those are permanent.
  const code = (error as { code?: string })?.code;
  if (typeof code === "string" && code.length > 0) {
    // 5xx-ish PostgREST/Postgres codes are worth retrying; 4xx-ish are not.
    if (/^(08|53|57|58|xx)/.test(code)) return true;
    return false;
  }

  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("econnrefused")
  );
}

// ── Enqueue ─────────────────────────────────────────────────────────────────

/**
 * A UUID, falling back to a random string where `crypto.randomUUID` is missing.
 *
 * Exported because callers need it too: a queued insert cannot read back a
 * server-generated key, so any row a caller must reference afterwards has to
 * carry a client-generated id. Every id column in this schema is a UUID with a
 * default, so supplying one is equivalent to letting the server pick.
 */
export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Next sequence number, derived from what is already stored so ordering
 * survives a page reload rather than restarting from zero.
 */
async function nextSeq(): Promise<number> {
  const existing = (await getOfflineQueue()) as QueuedMutation[];
  const highest = existing.reduce(
    (max, m) => (typeof m.seq === "number" && m.seq > max ? m.seq : max),
    0,
  );
  return highest + 1;
}

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, "id" | "seq">,
): Promise<string> {
  const id = newId();
  await saveToOfflineQueue({ ...mutation, id, seq: await nextSeq() });
  notifyQueueChanged();
  return id;
}

// ── Core wrapper ────────────────────────────────────────────────────────────

/**
 * Runs a Supabase write, falling back to the durable queue when the device is
 * offline or the failure is transient.
 *
 * `run` performs the actual query so callers keep full control over `select`,
 * `single`, and so on. `spec` describes the same intent declaratively, which is
 * what gets replayed later.
 */
export async function mutateWithOfflineQueue<T>(
  run: () => Promise<T>,
  spec: Omit<QueuedMutation, "id" | "seq">,
): Promise<OfflineMutationResult<T>> {
  if (!navigator.onLine) {
    await enqueueMutation(spec);
    return { synced: false, queued: true };
  }

  try {
    const data = await run();
    return { synced: true, queued: false, data };
  } catch (error) {
    if (!isRetriableFailure(error)) throw error;
    await enqueueMutation(spec);
    return { synced: false, queued: true };
  }
}

// ── Replay ──────────────────────────────────────────────────────────────────

export interface SyncOutcome {
  attempted: number;
  succeeded: number;
  failed: number;
  /**
   * Writes dropped because the row moved on while they were queued. Counted
   * apart from `failed` so the UI can say "someone else changed this" rather
   * than "something went wrong".
   */
  conflicted: number;
  /** One line per conflict, safe to show the user. */
  conflicts: string[];
  /** Query keys touched by successful replays, for cache invalidation. */
  invalidate: string[][];
}

let syncInFlight: Promise<SyncOutcome> | null = null;

/**
 * Drains the queue against the server. Concurrent callers share one run, so a
 * reconnect event and a manual retry cannot double-apply mutations.
 *
 * Mutations replay oldest-first. A permanently rejected mutation is marked
 * `failed` and skipped rather than blocking everything behind it.
 */
export function syncQueuedMutations(client: MutationClient): Promise<SyncOutcome> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async (): Promise<SyncOutcome> => {
    // Strict FIFO by sequence number. Falls back to createdAt for any row
    // written before `seq` existed.
    const pending = ((await getOfflineQueue()) as QueuedMutation[])
      .slice()
      .sort(
        (a, b) =>
          (a.seq ?? 0) - (b.seq ?? 0) ||
          String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
      );

    const outcome: SyncOutcome = {
      attempted: pending.length,
      succeeded: 0,
      failed: 0,
      conflicted: 0,
      conflicts: [],
      invalidate: [],
    };

    for (const mutation of pending) {
      try {
        await applyMutation(client, mutation);
        await updateOfflineQueue(mutation.id, "completed");
        outcome.succeeded += 1;
        if (mutation.invalidate) outcome.invalidate.push(...mutation.invalidate);
      } catch (error) {
        // Checked before retriability: a conflict is terminal by definition, and
        // its message must never be mistaken for a transient network fault.
        if (error instanceof MutationConflictError) {
          await updateOfflineQueue(mutation.id, "conflict");
          outcome.conflicted += 1;
          outcome.conflicts.push(error.message);
          // The row this edit targeted has changed, so refresh the views that
          // showed the stale value.
          if (mutation.invalidate) outcome.invalidate.push(...mutation.invalidate);
          continue;
        }

        if (isRetriableFailure(error)) {
          // Still offline or the server is down — leave it pending and stop, so
          // ordering is preserved for the next attempt.
          break;
        }
        await updateOfflineQueue(mutation.id, "failed");
        outcome.failed += 1;
      }
    }

    if (outcome.succeeded > 0 || outcome.failed > 0 || outcome.conflicted > 0) {
      notifyQueueChanged();
    }
    return outcome;
  })();

  try {
    return syncInFlight;
  } finally {
    // Release the lock once the run settles, whatever the result.
    syncInFlight.finally(() => {
      syncInFlight = null;
    });
  }
}

async function applyMutation(
  client: MutationClient,
  mutation: QueuedMutation,
): Promise<void> {
  const table = client.from(mutation.table);
  const column = mutation.matchColumn ?? "id";

  if (mutation.action === "insert") {
    const { error } = await table.insert(mutation.payload);
    if (error) throw error;
    return;
  }

  if (mutation.matchValue === undefined) {
    // Nothing to target — treat as permanently broken rather than retrying.
    throw new Error(
      `Queued ${mutation.action} on ${mutation.table} has no match value`,
    );
  }

  // Optimistic-concurrency path. Matching on the `updated_at` the client last
  // saw means a row someone else has since edited simply does not match, and
  // PostgREST reports that as success-with-zero-rows rather than an error — so
  // the row count has to be read back explicitly via `select`.
  if (mutation.action === "update" && mutation.expectedUpdatedAt) {
    const { data, error } = await table
      .update(mutation.payload)
      .eq(column, mutation.matchValue)
      .eq("updated_at", mutation.expectedUpdatedAt)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) throw new MutationConflictError(mutation);
    return;
  }

  const { error } =
    mutation.action === "update"
      ? await table.update(mutation.payload).eq(column, mutation.matchValue)
      : await table.delete().eq(column, mutation.matchValue);

  if (error) throw error;
}

// ── Change notification ─────────────────────────────────────────────────────

const QUEUE_EVENT = "rr:offline-queue-change";

function notifyQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

/** Subscribe to queue depth changes. Returns an unsubscribe function. */
export function onQueueChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(QUEUE_EVENT, listener);
  return () => window.removeEventListener(QUEUE_EVENT, listener);
}

/** Number of mutations still waiting to replay. */
export async function pendingMutationCount(): Promise<number> {
  return (await getOfflineQueue()).length;
}
