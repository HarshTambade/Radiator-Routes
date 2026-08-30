// OpenTripMap — place / POI discovery. Free tier, key optional.
// Without a key the functions resolve to empty results so the Explore page
// falls back to curated destinations instead of erroring.

import { getJson, qs } from "@/lib/http";

const BASE_URL = "https://api.opentripmap.com/0.1/en/places";
const API_KEY = import.meta.env.VITE_OPENTRIPMAP_API_KEY as string | undefined;

export function isOpenTripMapConfigured(): boolean {
  return Boolean(API_KEY && API_KEY.length > 8);
}

export interface OTMPlace {
  xid: string;
  name: string;
  dist?: number;
  rate?: number;
  osm?: string;
  kinds?: string;
  point?: { lon: number; lat: number };
}

export interface OTMPlaceDetail {
  xid: string;
  name: string;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    road?: string;
    house_number?: string;
    country_code?: string;
  };
  rate?: number;
  osm?: string;
  kinds?: string;
  otm?: string;
  wikipedia?: string;
  image?: string;
  preview?: { source?: string; height?: number; width?: number };
  wikipedia_extracts?: { title?: string; text?: string; html?: string };
  point?: { lon: number; lat: number };
  bbox?: {
    lon_min: number;
    lat_min: number;
    lon_max: number;
    lat_max: number;
  };
  url?: string;
  wikidata?: string;
  info?: { descr?: string; image?: string; src?: string };
}

/** Places within a radius (metres) of a point. */
export async function otmRadius(params: {
  lat: number;
  lon: number;
  radius?: number;
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  const {
    lat,
    lon,
    radius = 5000,
    kinds = "interesting_places",
    limit = 20,
    rate,
    format = "json",
  } = params;

  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required for radius search");
  if (radius < 0 || radius > 100_000)
    throw new Error("radius must be between 0 and 100000 metres");
  if (!isOpenTripMapConfigured()) return [];

  return getJson<OTMPlace[]>(
    `${BASE_URL}/radius${qs({
      radius,
      lon,
      lat,
      kinds,
      limit,
      format,
      rate,
      apikey: API_KEY,
    })}`,
    { label: "OpenTripMap radius" },
  );
}

/** Full detail for a place by its OpenTripMap xid. */
export async function otmDetails(xid: string): Promise<OTMPlaceDetail> {
  const id = xid?.trim();
  if (!id) throw new Error("xid is required for details");
  if (!isOpenTripMapConfigured())
    throw new Error(
      "OpenTripMap is not configured. Set VITE_OPENTRIPMAP_API_KEY to load place details.",
    );

  return getJson<OTMPlaceDetail>(
    `${BASE_URL}/xid/${encodeURIComponent(id)}${qs({ apikey: API_KEY })}`,
    { label: "OpenTripMap details" },
  );
}

/** Name search near a point. */
export async function otmAutosuggest(params: {
  name: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  kinds?: string;
}): Promise<OTMPlace[]> {
  const { name, lat, lon, radius = 50_000, limit = 10, kinds } = params;

  if (!name?.trim()) throw new Error("name is required for autosuggest");
  if (lat === undefined || lon === undefined)
    throw new Error("lat and lon are required for autosuggest");
  if (!isOpenTripMapConfigured()) return [];

  return getJson<OTMPlace[]>(
    `${BASE_URL}/autosuggest${qs({
      name: name.trim(),
      radius,
      lon,
      lat,
      limit,
      kinds,
      apikey: API_KEY,
    })}`,
    { label: "OpenTripMap autosuggest" },
  );
}

/** Places inside a bounding box. */
export async function otmBbox(params: {
  bbox: { lon_min: number; lat_min: number; lon_max: number; lat_max: number };
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  const {
    bbox,
    kinds = "interesting_places",
    limit = 20,
    rate,
    format = "json",
  } = params;

  if (
    !bbox ||
    bbox.lon_min === undefined ||
    bbox.lat_min === undefined ||
    bbox.lon_max === undefined ||
    bbox.lat_max === undefined
  ) {
    throw new Error("bbox with lon_min, lat_min, lon_max, lat_max is required");
  }
  if (!isOpenTripMapConfigured()) return [];

  return getJson<OTMPlace[]>(
    `${BASE_URL}/bbox${qs({ ...bbox, kinds, limit, format, rate, apikey: API_KEY })}`,
    { label: "OpenTripMap bbox" },
  );
}

/** Unified action dispatcher (kept for wire compatibility). */
export async function opentripmap(body: {
  action: "radius" | "details" | "autosuggest" | "bbox";
  [key: string]: unknown;
}): Promise<OTMPlace[] | OTMPlaceDetail> {
  const { action, ...params } = body;
  switch (action) {
    case "radius":
      return otmRadius(params as Parameters<typeof otmRadius>[0]);
    case "details":
      return otmDetails(params.xid as string);
    case "autosuggest":
      return otmAutosuggest(params as Parameters<typeof otmAutosuggest>[0]);
    case "bbox":
      return otmBbox(params as Parameters<typeof otmBbox>[0]);
    default:
      throw new Error(
        `Unknown action: "${action}". Supported: radius, details, autosuggest, bbox`,
      );
  }
}
