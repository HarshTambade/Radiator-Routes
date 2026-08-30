import { IDBPDatabase, openDB } from "idb";

const DB_NAME = "radiator-routes-db";
const DB_VERSION = 1;

type StoreName = "trips" | "itinerary" | "places" | "media" | "searchHistory" | "offlineQueue";

const STORES: StoreName[] = ["trips", "itinerary", "places", "media", "searchHistory", "offlineQueue"];

export async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id" });
          
          if (storeName === "trips") {
            store.createIndex("userId", "userId");
            store.createIndex("createdAt", "createdAt");
            store.createIndex("updatedAt", "updatedAt");
          }
          
          if (storeName === "itinerary") {
            store.createIndex("tripId", "tripId");
            store.createIndex("date", "date");
          }
          
          if (storeName === "places") {
            store.createIndex("searchQuery", "searchQuery");
            store.createIndex("type", "type");
          }
          
          if (storeName === "media") {
            store.createIndex("tripId", "tripId");
            store.createIndex("createdAt", "createdAt");
          }
          
          if (storeName === "searchHistory") {
            store.createIndex("userId", "userId");
            store.createIndex("timestamp", "timestamp");
          }
          
          if (storeName === "offlineQueue") {
            store.createIndex("createdAt", "createdAt");
            store.createIndex("status", "status");
          }
        }
      });
    },
  });
}

export async function saveTrip(trip: any) {
  const db = await getDB();
  await db.put("trips", { ...trip, updatedAt: new Date().toISOString() });
  db.close();
}

export async function saveItinerary(item: any) {
  const db = await getDB();
  await db.put("itinerary", { ...item, updatedAt: new Date().toISOString() });
  db.close();
}

export async function savePlace(place: any) {
  const db = await getDB();
  await db.put("places", place);
  db.close();
}

export async function saveMedia(item: any) {
  const db = await getDB();
  await db.put("media", { ...item, createdAt: new Date().toISOString() });
  db.close();
}

export async function saveSearchHistory(item: any) {
  const db = await getDB();
  await db.put("searchHistory", { ...item, timestamp: new Date().toISOString() });
  db.close();
}

export async function saveToOfflineQueue(item: any) {
  const db = await getDB();
  await db.put("offlineQueue", { ...item, createdAt: new Date().toISOString(), status: "pending" });
  db.close();
}

export async function getTrip(id: string) {
  const db = await getDB();
  const trip = await db.get("trips", id);
  db.close();
  return trip;
}

export async function getItinerary(tripId: string) {
  const db = await getDB();
  const items = await db.getAllFromIndex("itinerary", "tripId", tripId);
  db.close();
  return items;
}

export async function getPlace(id: string) {
  const db = await getDB();
  const place = await db.get("places", id);
  db.close();
  return place;
}

export async function getMedia(tripId: string) {
  const db = await getDB();
  const items = await db.getAllFromIndex("media", "tripId", tripId);
  db.close();
  return items;
}

export async function getSearchHistory(userId: string) {
  const db = await getDB();
  const items = await db.getAllFromIndex("searchHistory", "userId", userId);
  db.close();
  return items;
}

export async function getOfflineQueue() {
  const db = await getDB();
  const items = await db.getAllFromIndex("offlineQueue", "status", "pending");
  db.close();
  return items;
}

export async function updateOfflineQueue(id: string, status: "pending" | "completed" | "failed") {
  const db = await getDB();
  const item = await db.get("offlineQueue", id);
  if (item) {
    await db.put("offlineQueue", { ...item, status, updatedAt: new Date().toISOString() });
  }
  db.close();
}

export async function deleteTrip(id: string) {
  const db = await getDB();
  await db.delete("trips", id);
  db.close();
}

export async function deleteItinerary(tripId: string) {
  const db = await getDB();
  await db.clear("itinerary");
  db.close();
}

export async function clearAllData() {
  const db = await getDB();
  STORES.forEach((storeName) => db.clear(storeName));
  db.close();
}

export async function countAllData() {
  const db = await getDB();
  const counts: Record<string, number> = {};
  const keys: string[] = ["trips", "itinerary", "places", "media", "searchHistory"];
  
  for (const key of keys) {
    counts[key] = await db.count(key);
  }
  
  db.close();
  return counts;
}

export async function upgradeDB(oldVersion: number) {
  const db = await getDB();
  if (oldVersion < 1) {
    // Initial upgrade logic
    console.log("Upgrading database from version 0 to 1");
  }
  db.close();
}

export default getDB;
