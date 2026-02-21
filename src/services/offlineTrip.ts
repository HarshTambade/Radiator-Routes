// ── Offline Trip Storage Service ─────────────────────────────────────────────
// Uses IndexedDB to persist full trip data (trip, itineraries, activities)
// Also pre-caches OpenStreetMap tiles for offline map usage via Cache API

const DB_NAME = "radiator-routes-offline";
const DB_VERSION = 1;
const TRIPS_STORE = "offline-trips";
const TILE_CACHE_NAME = "osm-tiles-offline";

export interface OfflineTripData {
  tripId: string;
  trip: Record<string, unknown>;
  itineraries: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  savedAt: number;
  destinationLat?: number;
  destinationLng?: number;
  tilesCached: boolean;
  tileCacheCount?: number;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TRIPS_STORE)) {
        db.createObjectStore(TRIPS_STORE, { keyPath: "tripId" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(`IndexedDB open failed: ${req.error?.message}`));
  });
}

export async function saveTripOffline(data: OfflineTripData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIPS_STORE, "readwrite");
    const store = tx.objectStore(TRIPS_STORE);
    store.put(data);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new Error(`Save failed: ${tx.error?.message}`)); };
  });
}

export async function getOfflineTripData(tripId: string): Promise<OfflineTripData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIPS_STORE, "readonly");
    const store = tx.objectStore(TRIPS_STORE);
    const req = store.get(tripId);
    req.onsuccess = () => { db.close(); resolve((req.result as OfflineTripData) ?? null); };
    req.onerror = () => { db.close(); reject(new Error(`Get failed: ${req.error?.message}`)); };
  });
}

export async function getAllOfflineTrips(): Promise<OfflineTripData[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIPS_STORE, "readonly");
    const store = tx.objectStore(TRIPS_STORE);
    const req = store.getAll();
    req.onsuccess = () => { db.close(); resolve((req.result as OfflineTripData[]) ?? []); };
    req.onerror = () => { db.close(); reject(new Error(`GetAll failed: ${req.error?.message}`)); };
  });
}

export async function removeOfflineTrip(tripId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIPS_STORE, "readwrite");
    const store = tx.objectStore(TRIPS_STORE);
    store.delete(tripId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new Error(`Delete failed: ${tx.error?.message}`)); };
  });
}

export async function isTripOffline(tripId: string): Promise<boolean> {
  try {
    const data = await getOfflineTripData(tripId);
    return data !== null;
  } catch {
    return false;
  }
}

// ── Map Tile Maths ────────────────────────────────────────────────────────────

/** Convert WGS-84 lat/lng + zoom to OSM tile x/y */
function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

interface TileCoord { z: number; x: number; y: number }

/** Return all tile coords within `radius` tiles of a centre lat/lng at one zoom level */
function getTilesAround(
  lat: number,
  lng: number,
  zoom: number,
  radius: number,
): TileCoord[] {
  const centre = latLngToTileXY(lat, lng, zoom);
  const maxTile = Math.pow(2, zoom) - 1;
  const tiles: TileCoord[] = [];

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const tx = Math.max(0, Math.min(maxTile, centre.x + dx));
      const ty = Math.max(0, Math.min(maxTile, centre.y + dy));
      tiles.push({ z: zoom, x: tx, y: ty });
    }
  }
  return tiles;
}

/** Build OSM tile URL – uses round-robin a/b/c subdomains */
function tileUrl(z: number, x: number, y: number): string {
  const sub = ["a", "b", "c"][x % 3];
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// ── Pre-cache map tiles via Cache API ─────────────────────────────────────────

/**
 * Pre-caches OSM tiles for the destination.
 * Zoom levels & radii chosen to balance coverage vs download size.
 *   z10 r2 → 25 tiles  (city overview)
 *   z11 r2 → 25 tiles  (neighbourhood)
 *   z12 r3 → 49 tiles  (street level)
 *   z13 r3 → 49 tiles  (detail)
 *   z14 r2 → 25 tiles  (walking detail)
 * Total max: ~173 tiles (~20 MB uncompressed, ~6–8 MB on network)
 */
export async function precacheMapTiles(
  lat: number,
  lng: number,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!("caches" in window)) {
    console.warn("[offline] Cache API not available — tile pre-cache skipped");
    return 0;
  }

  const zoomConfig: { zoom: number; radius: number }[] = [
    { zoom: 10, radius: 2 },
    { zoom: 11, radius: 2 },
    { zoom: 12, radius: 3 },
    { zoom: 13, radius: 3 },
    { zoom: 14, radius: 2 },
  ];

  // Build de-duplicated list of tile URLs
  const seen = new Set<string>();
  const allUrls: string[] = [];
  for (const { zoom, radius } of zoomConfig) {
    for (const t of getTilesAround(lat, lng, zoom, radius)) {
      const url = tileUrl(t.z, t.x, t.y);
      if (!seen.has(url)) { seen.add(url); allUrls.push(url); }
    }
  }

  const cache = await caches.open(TILE_CACHE_NAME);
  const CONCURRENCY = 6;
  let done = 0;
  let cached = 0;

  for (let i = 0; i < allUrls.length; i += CONCURRENCY) {
    const batch = allUrls.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const existing = await cache.match(url);
          if (!existing) {
            const res = await fetch(url, { mode: "cors" });
            if (res.ok) {
              await cache.put(url, res);
              cached++;
            }
          } else {
            cached++; // already cached counts as success
          }
        } catch {
          // Individual tile failures are silent — offline map just has gaps
        } finally {
          done++;
          onProgress?.(done, allUrls.length);
        }
      }),
    );
  }

  return cached;
}

/** Remove all cached OSM tiles belonging to the offline tile cache */
export async function clearTileCache(): Promise<void> {
  if ("caches" in window) {
    await caches.delete(TILE_CACHE_NAME);
  }
}

/** Approximate size of the tile cache in bytes */
export async function getTileCacheSize(): Promise<number> {
  if (!("caches" in window)) return 0;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const keys = await cache.keys();
    let totalBytes = 0;
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) {
        const blob = await res.blob();
        totalBytes += blob.size;
      }
    }
    return totalBytes;
  } catch {
    return 0;
  }
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
