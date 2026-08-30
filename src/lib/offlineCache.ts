import { getDB, saveTrip, saveItinerary, savePlace, saveMedia, saveSearchHistory } from "./idb";

/** Anything we persist carries these bookkeeping fields. */
interface CachedRecord {
  id: string;
  _cached?: boolean;
  timestamp?: number;
  [key: string]: unknown;
}

type CacheStore = "trips" | "itinerary" | "places" | "media" | "searchHistory";

const CACHE_TTL: Record<CacheStore, number> = {
  trips: 24 * 60 * 60 * 1000, // 24 h
  itinerary: 12 * 60 * 60 * 1000, // 12 h
  places: 7 * 24 * 60 * 60 * 1000, // 7 d
  media: 30 * 24 * 60 * 60 * 1000, // 30 d
  searchHistory: 30 * 24 * 60 * 60 * 1000, // 30 d
};

const isFresh = (record: CachedRecord | undefined, ttl: number) =>
  !!record?._cached && Date.now() - (record.timestamp ?? 0) < ttl;

// ── Writes ───────────────────────────────────────────────────────────────────

export async function cacheTrip(tripId: string, tripData: Record<string, unknown>) {
  await saveTrip({ ...tripData, id: tripId, _cached: true, timestamp: Date.now() });
}

export async function cacheItinerary(tripId: string, items: Record<string, unknown>[]) {
  const now = Date.now();
  for (const [index, item] of items.entries()) {
    await saveItinerary({
      ...item,
      id: `${tripId}-${item.id ?? index}`,
      tripId,
      _cached: true,
      timestamp: (item.timestamp as number) ?? now,
    });
  }
}

export async function cachePlace(placeId: string, placeData: Record<string, unknown>) {
  await savePlace({ ...placeData, id: placeId, _cached: true, timestamp: Date.now() });
}

export async function cacheMedia(tripId: string, mediaItems: Record<string, unknown>[]) {
  const now = Date.now();
  for (const [index, item] of mediaItems.entries()) {
    await saveMedia({
      ...item,
      id: `${tripId}-${index}-${now}`,
      tripId,
      _cached: true,
      timestamp: now,
    });
  }
}

export async function cacheSearch(query: string, results: unknown[]) {
  await saveSearchHistory({
    id: `search-${query.toLowerCase().trim()}`,
    query,
    results,
    _cached: true,
    timestamp: Date.now(),
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getCachedTrip(tripId: string): Promise<CachedRecord | null> {
  const db = await getDB();
  try {
    const trip = (await db.get("trips", tripId)) as CachedRecord | undefined;
    if (!trip) return null;
    if (!isFresh(trip, CACHE_TTL.trips)) {
      await db.delete("trips", tripId);
      return null;
    }
    return trip;
  } finally {
    db.close();
  }
}

export async function getCachedItinerary(tripId: string): Promise<CachedRecord[]> {
  const db = await getDB();
  try {
    const items = (await db.getAllFromIndex("itinerary", "tripId", tripId)) as CachedRecord[];
    return items.filter((item) => isFresh(item, CACHE_TTL.itinerary));
  } finally {
    db.close();
  }
}

export async function getCachedPlace(placeId: string): Promise<CachedRecord | null> {
  const db = await getDB();
  try {
    const place = (await db.get("places", placeId)) as CachedRecord | undefined;
    if (!place) return null;
    if (!isFresh(place, CACHE_TTL.places)) {
      await db.delete("places", placeId);
      return null;
    }
    return place;
  } finally {
    db.close();
  }
}

export async function getCachedSearch(query: string): Promise<unknown[] | null> {
  const db = await getDB();
  try {
    const entry = (await db.get("searchHistory", `search-${query.toLowerCase().trim()}`)) as
      | (CachedRecord & { results?: unknown[] })
      | undefined;
    if (!entry || !isFresh(entry, CACHE_TTL.searchHistory)) return null;
    return entry.results ?? null;
  } finally {
    db.close();
  }
}

// ── Deletes ──────────────────────────────────────────────────────────────────

export async function deleteCachedTrip(tripId: string) {
  const db = await getDB();
  try {
    await db.delete("trips", tripId);
  } finally {
    db.close();
  }
}

export async function deleteCachedItinerary(tripId: string) {
  const db = await getDB();
  try {
    const keys = await db.getAllKeysFromIndex("itinerary", "tripId", tripId);
    const tx = db.transaction("itinerary", "readwrite");
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
  } finally {
    db.close();
  }
}

export async function deleteCachedPlace(placeId: string) {
  const db = await getDB();
  try {
    await db.delete("places", placeId);
  } finally {
    db.close();
  }
}

/**
 * Walks every store and drops records past their TTL. Uses a single
 * read-write transaction per store and reassigns the cursor on each step —
 * `cursor.continue()` resolves to the *next* cursor, it does not mutate.
 */
export async function clearExpiredCaches() {
  const now = Date.now();
  const db = await getDB();

  try {
    for (const store of Object.keys(CACHE_TTL) as CacheStore[]) {
      const ttl = CACHE_TTL[store];
      const tx = db.transaction(store, "readwrite");
      let cursor = await tx.store.openCursor();

      while (cursor) {
        const record = cursor.value as CachedRecord;
        if (record._cached && now - (record.timestamp ?? 0) > ttl) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }

      await tx.done;
    }
  } finally {
    db.close();
  }
}

export async function getCacheStats(): Promise<Record<CacheStore, number>> {
  const db = await getDB();
  try {
    const stats = {} as Record<CacheStore, number>;
    for (const store of Object.keys(CACHE_TTL) as CacheStore[]) {
      stats[store] = await db.count(store);
    }
    return stats;
  } finally {
    db.close();
  }
}

export function isOnline() {
  return navigator.onLine;
}

/**
 * Network-first with an IndexedDB fallback. Online, the live fetch wins; if it
 * throws — or we're offline — fall back to whatever was cached under `key`, and
 * only reject when there is nothing to fall back to.
 */
export async function cacheWithOfflineSupport<T>(
  key: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  if (isOnline()) {
    try {
      return await fetchFn();
    } catch (error) {
      const cached = await getCachedTrip(key);
      if (cached) return cached as T;
      throw error;
    }
  }

  const cached = await getCachedTrip(key);
  if (cached) return cached as T;
  throw new Error("Offline and no cache available");
}
