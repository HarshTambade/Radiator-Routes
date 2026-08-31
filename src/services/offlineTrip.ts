// ─────────────────────────────────────────────────────────────────────────────
// Offline trip storage — now backed by `lib/idb.ts`
// ─────────────────────────────────────────────────────────────────────────────
// Used to open its own IndexedDB database (`radiator-routes-offline`) with raw
// IndexedDB, alongside the `radiator-routes-db` database `lib/idb.ts` opens with
// the `idb` wrapper. Two databases meant two quota budgets and two eviction
// stories for one feature, and any user-triggered "clear offline data" that
// only knew about one of them was quietly incomplete.
//
// P4 merged them. The trip records live in the `offlineTrips` store of
// `radiator-routes-db`, and `lib/idb.ts`'s v1→v2 upgrade copies over anything a
// previous install saved to the legacy database. The public shape here is
// unchanged so callers did not have to move.
//
// This file now hosts only what does not belong in `lib/idb.ts`: the OSM map
// tile pre-cache, which uses the Cache API rather than IndexedDB.
// ─────────────────────────────────────────────────────────────────────────────

import {
  deleteOfflineTrip,
  getAllOfflineTrips as getAllOfflineTripsFromDB,
  getOfflineTrip,
  saveOfflineTrip,
} from "@/lib/idb";

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

// ── Trip persistence ─────────────────────────────────────────────────────────

export async function saveTripOffline(data: OfflineTripData): Promise<void> {
  // `offlineTrips` uses `tripId` as its key path (see lib/idb.ts), so no `id`
  // synthesis is needed — the shape crosses over unchanged.
  await saveOfflineTrip(data as unknown as Record<string, unknown>);
}

export async function getOfflineTripData(
  tripId: string,
): Promise<OfflineTripData | null> {
  const row = await getOfflineTrip(tripId);
  return (row as unknown as OfflineTripData | undefined) ?? null;
}

export async function getAllOfflineTrips(): Promise<OfflineTripData[]> {
  const rows = await getAllOfflineTripsFromDB();
  return rows as unknown as OfflineTripData[];
}

export async function removeOfflineTrip(tripId: string): Promise<void> {
  await deleteOfflineTrip(tripId);
}

export async function isTripOffline(tripId: string): Promise<boolean> {
  try {
    return (await getOfflineTripData(tripId)) !== null;
  } catch {
    return false;
  }
}

// ── Map Tile Maths ───────────────────────────────────────────────────────────

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
