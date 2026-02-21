// OpenTripMap API service
// Calls OpenTripMap API directly from the browser — no Supabase edge function needed

const BASE_URL = "https://api.opentripmap.com/0.1/en/places";
const API_KEY = import.meta.env.VITE_OPENTRIPMAP_API_KEY as string;

export interface OTMPlace {
  xid: string;
  name: string;
  dist?: number;
  rate?: number;
  osm?: string;
  kinds?: string;
  point?: {
    lon: number;
    lat: number;
  };
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
  sources?: {
    geometry?: string;
    attributes?: string[];
  };
  otm?: string;
  wikipedia?: string;
  image?: string;
  preview?: {
    source?: string;
    height?: number;
    width?: number;
  };
  wikipedia_extracts?: {
    title?: string;
    text?: string;
    html?: string;
  };
  point?: {
    lon: number;
    lat: number;
  };
  bbox?: {
    lon_min: number;
    lat_min: number;
    lon_max: number;
    lat_max: number;
  };
  url?: string;
  wikidata?: string;
  info?: {
    descr?: string;
    image?: string;
    img_width?: number;
    img_height?: number;
    src?: string;
    src_id?: number;
  };
}

// ── Places within radius ─────────────────────────────────────────────────────
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

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required for radius search");
  }

  if (radius < 0 || radius > 100_000) {
    throw new Error("radius must be between 0 and 100000 metres");
  }

  let url =
    `${BASE_URL}/radius` +
    `?radius=${radius}` +
    `&lon=${lon}` +
    `&lat=${lat}` +
    `&kinds=${encodeURIComponent(kinds)}` +
    `&limit=${limit}` +
    `&format=${format}` +
    `&apikey=${API_KEY}`;

  if (rate !== undefined) url += `&rate=${rate}`;

  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenTripMap radius error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Place details by XID ─────────────────────────────────────────────────────
export async function otmDetails(xid: string): Promise<OTMPlaceDetail> {
  if (!xid || xid.trim() === "") {
    throw new Error("xid is required for details");
  }

  const url = `${BASE_URL}/xid/${encodeURIComponent(xid.trim())}?apikey=${API_KEY}`;

  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenTripMap details error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Autosuggest: search by name near coordinates ─────────────────────────────
export async function otmAutosuggest(params: {
  name: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  kinds?: string;
}): Promise<OTMPlace[]> {
  const { name, lat, lon, radius = 50_000, limit = 10, kinds } = params;

  if (!name || name.trim() === "") {
    throw new Error("name is required for autosuggest");
  }

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required for autosuggest");
  }

  let url =
    `${BASE_URL}/autosuggest` +
    `?name=${encodeURIComponent(name.trim())}` +
    `&radius=${radius}` +
    `&lon=${lon}` +
    `&lat=${lat}` +
    `&limit=${limit}` +
    `&apikey=${API_KEY}`;

  if (kinds) url += `&kinds=${encodeURIComponent(kinds)}`;

  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenTripMap autosuggest error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Places within bounding box ───────────────────────────────────────────────
export async function otmBbox(params: {
  bbox: {
    lon_min: number;
    lat_min: number;
    lon_max: number;
    lat_max: number;
  };
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  const { bbox, kinds = "interesting_places", limit = 20, rate, format = "json" } = params;

  if (
    !bbox ||
    bbox.lon_min === undefined ||
    bbox.lat_min === undefined ||
    bbox.lon_max === undefined ||
    bbox.lat_max === undefined
  ) {
    throw new Error("bbox with lon_min, lat_min, lon_max, lat_max is required");
  }

  let url =
    `${BASE_URL}/bbox` +
    `?lon_min=${bbox.lon_min}` +
    `&lat_min=${bbox.lat_min}` +
    `&lon_max=${bbox.lon_max}` +
    `&lat_max=${bbox.lat_max}` +
    `&kinds=${encodeURIComponent(kinds)}` +
    `&limit=${limit}` +
    `&format=${format}` +
    `&apikey=${API_KEY}`;

  if (rate !== undefined) url += `&rate=${rate}`;

  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenTripMap bbox error [${response.status}]: ${text}`);
  }

  return response.json();
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────
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
