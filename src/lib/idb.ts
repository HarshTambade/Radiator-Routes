import { type IDBPDatabase, openDB } from "idb";

const DB_NAME = "radiator-routes-db";

/**
 * v2 added `offlineTrips`, absorbing the separate `radiator-routes-offline`
 * database that `services/offlineTrip.ts` used to open with raw IndexedDB. Two
 * databases meant two quota budgets and two eviction stories for one feature.
 */
const DB_VERSION = 2;

export type StoreName =
  | "trips"
  | "itinerary"
  | "places"
  | "media"
  | "searchHistory"
  | "offlineQueue"
  | "offlineTrips";

/** Secondary indexes created per store on first open. */
const STORE_INDEXES: Record<StoreName, string[]> = {
  trips: ["userId", "createdAt", "updatedAt"],
  itinerary: ["tripId", "date"],
  places: ["searchQuery", "type"],
  media: ["tripId", "createdAt"],
  searchHistory: ["userId", "timestamp"],
  offlineQueue: ["createdAt", "status"],
  offlineTrips: ["savedAt"],
};

/**
 * Terminal states for a queued mutation.
 *
 * `conflict` is distinct from `failed` on purpose: the write was well-formed and
 * the server was reachable, but the row had already moved on. That is a fact the
 * user needs told, not an error to retry.
 */
export type QueueStatus = "pending" | "completed" | "failed" | "conflict";

/**
 * A row destined for one of the object stores.
 *
 * `id` is optional rather than required: stores with a custom key path (see
 * `CUSTOM_KEY_PATHS` — `offlineTrips` uses `tripId`) legitimately have no `id`
 * field, and constraining every caller to invent one was masking the real
 * shape.
 */
export interface StoredRecord {
  id?: string;
  [key: string]: unknown;
}

/** Stores whose primary key is a field other than `id`. */
const CUSTOM_KEY_PATHS: Partial<Record<StoreName, string>> = {
  // The offlineTrip service keyed rows by `tripId`, so the merged store keeps
  // the same field to spare callers a rename and let the v1→v2 upgrade copy
  // records straight across.
  offlineTrips: "tripId",
};

/**
 * Cached legacy migration so it runs at most once per page load. Runs *after*
 * the schema upgrade — dropping the source database from inside an active
 * upgrade transaction is not safely supported by every IndexedDB implementation,
 * so the copy is deferred until the target database is fully open.
 */
let legacyMigrationDone: Promise<void> | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const [name, indexes] of Object.entries(STORE_INDEXES) as [
        StoreName,
        string[],
      ][]) {
        if (db.objectStoreNames.contains(name)) continue;
        const keyPath = CUSTOM_KEY_PATHS[name] ?? "id";
        const store = db.createObjectStore(name, { keyPath });
        for (const index of indexes) store.createIndex(index, index);
      }
    },
  });

  // Best-effort import of anything a previous install saved to the standalone
  // radiator-routes-offline database. Runs outside `upgrade` so the follow-up
  // `deleteDatabase` is not fighting an active upgrade transaction. The db
  // handle is passed in explicitly, not fetched via `getDB`, because
  // `getDB` awaits this same promise — recursing back through it would
  // deadlock the first boot.
  if (!legacyMigrationDone) {
    legacyMigrationDone = migrateLegacyOfflineTrips(db).catch(() => {});
  }
  await legacyMigrationDone;

  return db;
}

/**
 * Copies rows from the standalone `radiator-routes-offline` database into the
 * merged `offlineTrips` store, then deletes the source.
 *
 * Best-effort. Any failure leaves the source database in place so the next boot
 * can retry — losing a saved trip is a worse outcome than a slow migration.
 */
async function migrateLegacyOfflineTrips(target: IDBPDatabase): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const legacyName = "radiator-routes-offline";
  const legacyStore = "offline-trips";

  // Skip when nothing needs migrating. `databases()` is Chromium/Safari;
  // older engines fall through to the open attempt, which is safe because a
  // nonexistent database opens empty.
  if (typeof indexedDB.databases === "function") {
    const known = await indexedDB.databases().catch(() => []);
    if (!known.some((entry) => entry.name === legacyName)) return;
  }

  const legacy = await new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(legacyName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  if (!legacy) return;

  let rows: StoredRecord[] = [];
  if (legacy.objectStoreNames.contains(legacyStore)) {
    rows = await new Promise<StoredRecord[]>((resolve) => {
      const tx = legacy.transaction(legacyStore, "readonly");
      const req = tx.objectStore(legacyStore).getAll();
      req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
      req.onerror = () => resolve([]);
    });
  }

  // Close before writing to the target: some IndexedDB implementations refuse
  // to satisfy a deleteDatabase while any connection to it is open.
  legacy.close();

  if (rows.length > 0) {
    const tx = target.transaction("offlineTrips", "readwrite");
    for (const row of rows) tx.store.put(row);
    await tx.done;
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(legacyName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/**
 * Test hook: forget that the legacy migration ran.
 *
 * The migration is guarded by a module-level promise so a single page load pays
 * its cost once. Tests that seed the legacy database between cases need to
 * reset that guard, or subsequent runs would skip the migration they exist to
 * exercise.
 */
export function __resetLegacyMigrationForTests(): void {
  legacyMigrationDone = null;
}

/** Open, run one operation, always close. Keeps callers from leaking handles. */
async function withDB<T>(fn: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  const db = await getDB();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

const put = (store: StoreName, record: StoredRecord) =>
  withDB((db) => db.put(store, record));

export const saveTrip = (trip: StoredRecord) =>
  put("trips", { ...trip, updatedAt: new Date().toISOString() });

export const saveItinerary = (item: StoredRecord) =>
  put("itinerary", { ...item, updatedAt: new Date().toISOString() });

export const savePlace = (place: StoredRecord) => put("places", place);

export const saveMedia = (item: StoredRecord) =>
  put("media", { createdAt: new Date().toISOString(), ...item });

export const saveSearchHistory = (item: StoredRecord) =>
  put("searchHistory", { timestamp: Date.now(), ...item });

export const saveToOfflineQueue = (item: StoredRecord) =>
  put("offlineQueue", {
    ...item,
    createdAt: new Date().toISOString(),
    status: "pending" satisfies QueueStatus,
  });

// ── Reads ────────────────────────────────────────────────────────────────────

export const getTrip = (id: string) =>
  withDB((db) => db.get("trips", id)) as Promise<StoredRecord | undefined>;

export const getItinerary = (tripId: string) =>
  withDB((db) => db.getAllFromIndex("itinerary", "tripId", tripId)) as Promise<StoredRecord[]>;

export const getPlace = (id: string) =>
  withDB((db) => db.get("places", id)) as Promise<StoredRecord | undefined>;

export const getMedia = (tripId: string) =>
  withDB((db) => db.getAllFromIndex("media", "tripId", tripId)) as Promise<StoredRecord[]>;

export const getSearchHistory = (userId: string) =>
  withDB((db) => db.getAllFromIndex("searchHistory", "userId", userId)) as Promise<StoredRecord[]>;

export const getOfflineQueue = () =>
  withDB((db) => db.getAllFromIndex("offlineQueue", "status", "pending")) as Promise<StoredRecord[]>;

// ── Offline trips (previously in services/offlineTrip.ts) ────────────────────
// Same on-disk shape as before, same keyPath, so the v1→v2 upgrade could copy
// rows across without any transformation.

export const saveOfflineTrip = (trip: StoredRecord) =>
  withDB((db) => db.put("offlineTrips", trip));

export const getOfflineTrip = (tripId: string) =>
  withDB((db) => db.get("offlineTrips", tripId)) as Promise<
    StoredRecord | undefined
  >;

export const getAllOfflineTrips = () =>
  withDB((db) => db.getAll("offlineTrips")) as Promise<StoredRecord[]>;

export const deleteOfflineTrip = (tripId: string) =>
  withDB((db) => db.delete("offlineTrips", tripId));

// ── Mutations & deletes ──────────────────────────────────────────────────────

export async function updateOfflineQueue(id: string, status: QueueStatus) {
  await withDB(async (db) => {
    const item = await db.get("offlineQueue", id);
    if (!item) return;
    await db.put("offlineQueue", { ...item, status, updatedAt: new Date().toISOString() });
  });
}

export const deleteTrip = (id: string) => withDB((db) => db.delete("trips", id));

/** Deletes only the itinerary rows belonging to `tripId`. */
export async function deleteItinerary(tripId: string) {
  await withDB(async (db) => {
    const keys = await db.getAllKeysFromIndex("itinerary", "tripId", tripId);
    const tx = db.transaction("itinerary", "readwrite");
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
  });
}

export async function clearAllData() {
  await withDB(async (db) => {
    for (const store of Object.keys(STORE_INDEXES) as StoreName[]) {
      await db.clear(store);
    }
  });
}

export async function countAllData(): Promise<Record<StoreName, number>> {
  return withDB(async (db) => {
    const counts = {} as Record<StoreName, number>;
    for (const store of Object.keys(STORE_INDEXES) as StoreName[]) {
      counts[store] = await db.count(store);
    }
    return counts;
  });
}
