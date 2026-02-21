// Nominatim (OpenStreetMap) geocoding service
// Calls Nominatim API directly from the browser — no Supabase edge function needed

const BASE_URL = "https://nominatim.openstreetmap.org";

const SHARED_HEADERS: HeadersInit = {
  "User-Agent": "RadiatorRoutes/2.0 (travel planning app)",
  "Accept-Language": "en",
  Accept: "application/json",
};

export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
  boundingbox?: string[];
}

// ── Forward geocoding: text → coordinates ───────────────────────────────────
export async function nominatimSearch(
  query: string,
  limit = 5,
): Promise<NominatimResult[]> {
  if (!query || query.trim() === "") {
    throw new Error("query is required for search");
  }

  const url =
    `${BASE_URL}/search` +
    `?q=${encodeURIComponent(query.trim())}` +
    `&format=json` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    `&extratags=1` +
    `&namedetails=1`;

  const response = await fetch(url, { headers: SHARED_HEADERS });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nominatim search error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Reverse geocoding: coordinates → address ─────────────────────────────────
export async function nominatimReverse(
  lat: number,
  lon: number,
): Promise<NominatimResult> {
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(
      "lat must be in [-90, 90] and lon must be in [-180, 180]",
    );
  }

  const url =
    `${BASE_URL}/reverse` +
    `?lat=${lat}` +
    `&lon=${lon}` +
    `&format=json` +
    `&addressdetails=1` +
    `&extratags=1` +
    `&namedetails=1`;

  const response = await fetch(url, { headers: SHARED_HEADERS });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nominatim reverse error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Lookup by OSM IDs ────────────────────────────────────────────────────────
export async function nominatimLookup(
  osm_ids: string,
): Promise<NominatimResult[]> {
  if (!osm_ids || osm_ids.trim() === "") {
    throw new Error("osm_ids is required (e.g. 'N123,W456')");
  }

  const url =
    `${BASE_URL}/lookup` +
    `?osm_ids=${encodeURIComponent(osm_ids.trim())}` +
    `&format=json` +
    `&addressdetails=1`;

  const response = await fetch(url, { headers: SHARED_HEADERS });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nominatim lookup error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────
export async function nominatim(body: {
  action: "search" | "reverse" | "lookup";
  query?: string;
  limit?: number;
  lat?: number;
  lon?: number;
  osm_ids?: string;
}): Promise<NominatimResult | NominatimResult[]> {
  const { action, ...params } = body;

  switch (action) {
    case "search":
      return nominatimSearch(params.query ?? "", params.limit);

    case "reverse":
      if (params.lat === undefined || params.lon === undefined) {
        throw new Error("lat and lon are required for reverse geocoding");
      }
      return nominatimReverse(params.lat, params.lon);

    case "lookup":
      return nominatimLookup(params.osm_ids ?? "");

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: search, reverse, lookup`,
      );
  }
}
