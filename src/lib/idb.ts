import { type IDBPDatabase, openDB } from "idb";

const DB_NAME = "radiator-routes-db";
const DB_VERSION = 1;

export type StoreName =
  | "trips"
  | "itinerary"
  | "places"
  | "media"
  | "searchHistory"
  | "offlineQueue";

/** Secondary indexes created per store on first open. */
const STORE_INDEXES: Record<StoreName, string[]> = {
  trips: ["userId", "createdAt", "updatedAt"],
  itinerary: ["tripId", "date"],
  places: ["searchQuery", "type"],
  media: ["tripId", "createdAt"],
  searchHistory: ["userId", "timestamp"],
  offlineQueue: ["createdAt", "status"],
};

export type QueueStatus = "pending" | "completed" | "failed";

export interface StoredRecord {
  id: string;
  [key: string]: unknown;
}

export async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const [name, indexes] of Object.entries(STORE_INDEXES) as [StoreName, string[]][]) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: "id" });
        for (const index of indexes) store.createIndex(index, index);
      }
    },
  });
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
