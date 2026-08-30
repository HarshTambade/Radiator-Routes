import { getDB, saveTrip, saveItinerary, savePlace, saveMedia, saveSearchHistory } from "./idb";

type CacheType = "trips" | "itinerary" | "places" | "media" | "searchHistory";

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  expires?: number;
}

const CACHE_TTL = {
  trips: 24 * 60 * 60 * 1000, // 24 hours
  itinerary: 12 * 60 * 60 * 1000, // 12 hours
  places: 7 * 24 * 60 * 60 * 1000, // 7 days
  media: 30 * 24 * 60 * 60 * 1000, // 30 days
  searchHistory: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export async function cacheTrip(tripId: string, tripData: any) {
  await saveTrip({ id: tripId, ...tripData, _cached: true });
}

export async function cacheItinerary(tripId: string, items: any[]) {
  const entries = items.map((item) => ({
    id: `${tripId}-${item.id || item.timestamp}`,
    tripId,
    ...item,
    _cached: true,
    timestamp: item.timestamp || Date.now(),
  }));
  
  for (const entry of entries) {
    await saveItinerary(entry);
  }
}

export async function cachePlace(placeId: string, placeData: any) {
  await savePlace({ id: placeId, ...placeData, _cached: true, timestamp: Date.now() });
}

export async function cacheMedia(tripId: string, mediaItems: any[]) {
  const entries = mediaItems.map((item, index) => ({
    id: `${tripId}-${index}-${Date.now()}`,
    tripId,
    ...item,
    _cached: true,
    timestamp: Date.now(),
  }));
  
  for (const entry of entries) {
    await saveMedia(entry);
  }
}

export async function cacheSearch(query: string, results: any[]) {
  const entry = {
    id: `search-${Date.now()}`,
    query,
    results,
    timestamp: Date.now(),
  };
  await saveSearchHistory(entry);
}

export async function getCachedTrip(tripId: string): Promise<any | null> {
  const db = await getDB();
  const trip = await db.get("trips", tripId);
  db.close();
  
  if (!trip || !trip._cached) return null;
  
  const isExpired = Date.now() - trip.timestamp > CACHE_TTL.trips;
  if (isExpired) {
    await deleteCachedTrip(tripId);
    return null;
  }
  
  return trip;
}

export async function getCachedItinerary(tripId: string): Promise<any[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex("itinerary", "tripId", tripId);
  db.close();
  
  const validItems = items.filter((item) => {
    if (!item._cached) return false;
    return Date.now() - (item.timestamp || 0) < CACHE_TTL.itinerary;
  });
  
  return validItems;
}

export async function getCachedPlace(placeId: string): Promise<any | null> {
  const db = await getDB();
  const place = await db.get("places", placeId);
  db.close();
  
  if (!place || !place._cached) return null;
  
  const isExpired = Date.now() - (place.timestamp || 0) > CACHE_TTL.places;
  if (isExpired) {
    await deleteCachedPlace(placeId);
    return null;
  }
  
  return place;
}

export async function getCachedSearch(query: string): Promise<any[] | null> {
  const db = await getDB();
  const entries = await db.getAll("searchHistory");
  db.close();
  
  const matchingEntry = entries.find(
    (entry) => entry.query === query && Date.now() - entry.timestamp < CACHE_TTL.searchHistory,
  );
  
  return matchingEntry?.results || null;
}

export async function deleteCachedTrip(tripId: string) {
  const db = await getDB();
  await db.delete("trips", tripId);
  db.close();
}

export async function deleteCachedItinerary(tripId: string) {
  const db = await getDB();
  const items = await db.getAllFromIndex("itinerary", "tripId", tripId);
  for (const item of items) {
    await db.delete("itinerary", item.id);
  }
  db.close();
}

export async function deleteCachedPlace(placeId: string) {
  const db = await getDB();
  await db.delete("places", placeId);
  db.close();
}

export async function clearExpiredCaches() {
  const now = Date.now();
  
  const clearExpired = async (store: string, ttl: number) => {
    const db = await getDB();
    const cursor = await db.transaction(store, "readwrite").store.openCursor();
    
    while (cursor) {
      const item = cursor.value;
      if (item._cached && now - (item.timestamp || 0) > ttl) {
        await cursor.delete();
      }
      cursor.continue();
    }
    db.close();
  };
  
  await clearExpired("trips", CACHE_TTL.trips);
  await clearExpired("itinerary", CACHE_TTL.itinerary);
  await clearExpired("places", CACHE_TTL.places);
  await clearExpired("media", CACHE_TTL.media);
  await clearExpired("searchHistory", CACHE_TTL.searchHistory);
}

export async function getCacheStats() {
  const db = await getDB();
  
  const stats: Record<string, number> = {};
  const keys: string[] = ["trips", "itinerary", "places", "media", "searchHistory"];
  
  for (const key of keys) {
    stats[key] = await db.count(key);
  }
  
  db.close();
  return stats;
}

export function isOnline() {
  return navigator.onLine;
}

export function cacheWithOfflineSupport<T>(
  key: string,
  fetchFn: () => Promise<T>,
  cacheType: CacheType = "places",
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    if (isOnline()) {
      try {
        const data = await fetchFn();
        resolve(data);
      } catch (error) {
        reject(error);
      }
    } else {
      const cached = await getCachedTrip(key);
      if (cached) {
        resolve(cached as T);
      } else {
        reject(new Error("Offline and no cache available"));
      }
    }
  });
}

export default {
  cacheTrip,
  cacheItinerary,
  cachePlace,
  cacheMedia,
  cacheSearch,
  getCachedTrip,
  getCachedItinerary,
  getCachedPlace,
  getCachedSearch,
  deleteCachedTrip,
  deleteCachedItinerary,
  deleteCachedPlace,
  clearExpiredCaches,
  getCacheStats,
  isOnline,
  cacheWithOfflineSupport,
};
