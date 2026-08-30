// Nominatim (OpenStreetMap) geocoding — free, no API key required.
// https://operations.osmfoundation.org/policies/nominatim/

import { getJson, qs } from "@/lib/http";

const BASE_URL = "https://nominatim.openstreetmap.org";

// Nominatim asks for an identifying UA; browsers set their own, so this is
// best-effort. Referer is sent automatically by the browser.
const HEADERS: HeadersInit = { "Accept-Language": "en" };

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

/** Forward geocoding: free-text → coordinates. */
export async function nominatimSearch(
  query: string,
  limit = 5,
): Promise<NominatimResult[]> {
  const q = query?.trim();
  if (!q) throw new Error("query is required for search");

  return getJson<NominatimResult[]>(
    `${BASE_URL}/search${qs({
      q,
      format: "json",
      limit,
      addressdetails: 1,
      extratags: 1,
      namedetails: 1,
    })}`,
    { headers: HEADERS, label: "Nominatim search" },
  );
}

/** Reverse geocoding: coordinates → address. */
export async function nominatimReverse(
  lat: number,
  lon: number,
): Promise<NominatimResult> {
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("lat must be in [-90, 90] and lon must be in [-180, 180]");
  }

  return getJson<NominatimResult>(
    `${BASE_URL}/reverse${qs({
      lat,
      lon,
      format: "json",
      addressdetails: 1,
      extratags: 1,
      namedetails: 1,
    })}`,
    { headers: HEADERS, label: "Nominatim reverse" },
  );
}

/** Look up specific OSM objects, e.g. "N123,W456". */
export async function nominatimLookup(
  osm_ids: string,
): Promise<NominatimResult[]> {
  const ids = osm_ids?.trim();
  if (!ids) throw new Error("osm_ids is required (e.g. 'N123,W456')");

  return getJson<NominatimResult[]>(
    `${BASE_URL}/lookup${qs({
      osm_ids: ids,
      format: "json",
      addressdetails: 1,
    })}`,
    { headers: HEADERS, label: "Nominatim lookup" },
  );
}

/** Unified action dispatcher (kept for wire compatibility). */
export async function nominatim(body: {
  action: "search" | "reverse" | "lookup";
  query?: string;
  limit?: number;
  lat?: number;
  lon?: number;
  osm_ids?: string;
}): Promise<NominatimResult | NominatimResult[]> {
  switch (body.action) {
    case "search":
      return nominatimSearch(body.query ?? "", body.limit);
    case "reverse":
      if (body.lat === undefined || body.lon === undefined)
        throw new Error("lat and lon are required for reverse geocoding");
      return nominatimReverse(body.lat, body.lon);
    case "lookup":
      return nominatimLookup(body.osm_ids ?? "");
    default:
      throw new Error(
        `Unknown action: "${body.action}". Supported: search, reverse, lookup`,
      );
  }
}
