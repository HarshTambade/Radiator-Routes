// ─────────────────────────────────────────────────────────────────────────────
// Traffic & search — free / open replacements for the TomTom API
// ─────────────────────────────────────────────────────────────────────────────
// Uses Nominatim (OSM) for search & reverse geocoding and returns a
// deterministic best-effort traffic estimate derived from time-of-day.
// Keeps the same public surface so existing callers stay wire-compatible.
// ORS-backed helpers (route, isochrone, matrix) are re-exported thin wrappers
// around openroute.ts so nothing depends on a paid TomTom key.
// ─────────────────────────────────────────────────────────────────────────────

import { nominatimSearch, nominatimReverse } from "./nominatim";
import {
  orsDirections,
  orsIsochrone,
  orsMatrix,
} from "./openroute";

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string | undefined;

type Coord = [number, number]; // [lon, lat]
interface WaypointParam { lat: number; lon: number }

// ── Deterministic traffic estimator ──────────────────────────────────────────
// No paid API — this classifies congestion based on local time-of-day.
function congestionByHour(hour: number): { level: number; label: string; emoji: string } {
  // 0-5 free flow, 6-8 heavy, 9-11 light, 12-14 moderate, 15-17 light,
  // 18-20 heavy, 21-23 light
  if (hour >= 8 && hour <= 10) return { level: 0.35, label: "Heavy — morning rush", emoji: "🔴" };
  if (hour >= 17 && hour <= 20) return { level: 0.4, label: "Heavy — evening rush", emoji: "🔴" };
  if (hour >= 11 && hour <= 15) return { level: 0.75, label: "Moderate", emoji: "🟡" };
  if (hour >= 6 && hour < 8) return { level: 0.55, label: "Building up", emoji: "🟠" };
  if (hour >= 16 && hour < 17) return { level: 0.6, label: "Building up", emoji: "🟠" };
  if (hour >= 21 && hour <= 23) return { level: 0.85, label: "Light", emoji: "🟢" };
  return { level: 0.95, label: "Free flow", emoji: "🟢" };
}

/** Estimate current traffic near a point. */
export async function trafficFlow(params: {
  lat: number;
  lon: number;
  zoom?: number;
}): Promise<{
  flowSegmentData: {
    currentSpeed: number;
    freeFlowSpeed: number;
    confidence: number;
    congestion: string;
    emoji: string;
    estimated: boolean;
  };
}> {
  const { lat, lon } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");

  const now = new Date();
  const { level, label, emoji } = congestionByHour(now.getHours());

  // Rough free-flow speed guesses: urban ~50 km/h, rural/coastal ~70 km/h
  const isUrban = Math.abs(lat) < 60; // crude proxy — always true in practice
  const freeFlowSpeed = isUrban ? 50 : 70;
  const currentSpeed = Math.round(freeFlowSpeed * level);

  return {
    flowSegmentData: {
      currentSpeed,
      freeFlowSpeed,
      confidence: 0.7,
      congestion: label,
      emoji,
      estimated: true,
    },
  };
}

/** Traffic incidents — no free live source, return an empty payload. */
export async function trafficIncidents(_params: {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}): Promise<{ incidents: Array<Record<string, unknown>>; estimated: true }> {
  return { incidents: [], estimated: true };
}

// ── Place / POI search via Nominatim ─────────────────────────────────────────
export async function tomtomSearch(params: {
  query: string;
  lat?: number;
  lon?: number;
  radius?: number;
  limit?: number;
}): Promise<{ results: Array<{ name: string; position: { lat: number; lon: number }; address?: string }> }> {
  const { query, limit = 10 } = params;
  if (!query || !query.trim()) throw new Error("query is required");

  const geo = await nominatimSearch(query, limit);
  return {
    results: geo.map((g) => ({
      name: g.display_name?.split(",")[0]?.trim() ?? "Result",
      position: { lat: parseFloat(g.lat), lon: parseFloat(g.lon) },
      address: g.display_name,
    })),
  };
}

/** Category search near coordinates — Nominatim keyword search. */
export async function tomtomCategorySearch(params: {
  query: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  categorySet?: string;
}): Promise<{ results: Array<{ name: string; position: { lat: number; lon: number } }> }> {
  const { query, lat, lon, limit = 10 } = params;
  if (!query || !query.trim()) throw new Error("query is required");
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");

  const enrichedQuery = `${query} near ${lat},${lon}`;
  const geo = await nominatimSearch(enrichedQuery, limit);
  return {
    results: geo.map((g) => ({
      name: g.display_name?.split(",")[0]?.trim() ?? "Result",
      position: { lat: parseFloat(g.lat), lon: parseFloat(g.lon) },
    })),
  };
}

/** Nearby search — reverse geocode + return the closest match. */
export async function tomtomNearbySearch(params: {
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  categorySet?: string;
}): Promise<{ results: Array<{ name: string; position: { lat: number; lon: number } }> }> {
  const { lat, lon } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");

  try {
    const result = await nominatimReverse(lat, lon);
    return {
      results: [
        {
          name: result.display_name?.split(",")[0]?.trim() ?? "Nearby place",
          position: { lat: parseFloat(result.lat), lon: parseFloat(result.lon) },
        },
      ],
    };
  } catch {
    return { results: [] };
  }
}

// ── Route / Isochrone / Matrix — delegate to OpenRouteService ───────────────
export async function trafficRoute(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  alternatives?: boolean;
  waypoints?: WaypointParam[];
}): Promise<unknown> {
  return orsDirections(params);
}

export async function trafficIsochrone(params: {
  lat: number;
  lon: number;
  range?: number[];
  range_type?: string;
  profile?: string;
  interval?: number;
  smoothing?: number;
}): Promise<unknown> {
  return orsIsochrone(params);
}

export async function trafficMatrix(params: {
  locations: Coord[];
  sources?: number[];
  destinations?: number[];
  profile?: string;
  metrics?: string[];
}): Promise<unknown> {
  return orsMatrix(params);
}

// ── Geocoding via Nominatim ─────────────────────────────────────────────────
export async function trafficGeocode(params: {
  query: string;
  size?: number;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, size = 5 } = params;
  if (!query || !query.trim()) throw new Error("query is required");
  return nominatimSearch(query, size);
}

export async function trafficReverseGeocode(params: {
  lat: number;
  lon: number;
  size?: number;
}): Promise<unknown> {
  const { lat, lon } = params;
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required");
  return nominatimReverse(lat, lon);
}

// ── Unified dispatcher ──────────────────────────────────────────────────────
export async function tomtom(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "traffic-flow": return trafficFlow(params as any);
    case "traffic-incidents": return trafficIncidents(params as any);
    case "search": return tomtomSearch(params as any);
    case "category-search": return tomtomCategorySearch(params as any);
    case "nearby-search": return tomtomNearbySearch(params as any);
    case "route": return trafficRoute(params as any);
    case "isochrone": return trafficIsochrone(params as any);
    case "matrix": return trafficMatrix(params as any);
    case "geocode": return trafficGeocode(params as any);
    case "reverse-geocode": return trafficReverseGeocode(params as any);
    default:
      throw new Error(
        `Unknown action: "${action}". Supported: ` +
          `traffic-flow, traffic-incidents, search, category-search, nearby-search, ` +
          `route, isochrone, matrix, geocode, reverse-geocode`,
      );
  }
}

// Preserve export just so imports don't break in transitive callers that used
// the old ORS_API_KEY constant (none remain, but this keeps tree-shaking clean).
export const __ORS_API_KEY_UNUSED__ = ORS_API_KEY;
