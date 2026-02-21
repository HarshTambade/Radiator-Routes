// OpenRouteService (ORS) API service
// Calls ORS directly from the browser — no Supabase edge function needed

const BASE_URL = "https://api.openrouteservice.org";
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string;

type Coord = [number, number]; // [lon, lat]

interface WaypointParam {
  lat: number;
  lon: number;
}

function getHeaders(includeAcceptGeoJson = false): HeadersInit {
  return {
    Authorization: ORS_API_KEY,
    "Content-Type": "application/json",
    Accept: includeAcceptGeoJson
      ? "application/json, application/geo+json"
      : "application/json",
  };
}

async function handleResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    throw new Error(
      `OpenRouteService error [${response.status}]: ${JSON.stringify(parsed)}`,
    );
  }
  return response.json();
}

// ── Directions (JSON) ────────────────────────────────────────────────────────
export async function orsDirections(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  alternatives?: boolean;
  waypoints?: WaypointParam[];
}): Promise<unknown> {
  const {
    origin,
    destination,
    profile = "driving-car",
    alternatives = false,
    waypoints = [],
  } = params;

  const coordinates: Coord[] = [
    [origin.lon, origin.lat],
    ...waypoints.map((w) => [w.lon, w.lat] as Coord),
    [destination.lon, destination.lat],
  ];

  const url = `${BASE_URL}/v2/directions/${profile}/json`;

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      coordinates,
      alternative_routes: alternatives
        ? { target_count: 3, weight_factor: 1.6, share_factor: 0.6 }
        : undefined,
      instructions: true,
      instructions_format: "text",
      language: "en",
      units: "km",
      geometry: true,
      elevation: false,
    }),
  });

  return handleResponse(response);
}

// ── Directions (GeoJSON) ─────────────────────────────────────────────────────
export async function orsDirectionsGeoJson(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  waypoints?: WaypointParam[];
}): Promise<unknown> {
  const { origin, destination, profile = "driving-car", waypoints = [] } = params;

  const coordinates: Coord[] = [
    [origin.lon, origin.lat],
    ...waypoints.map((w) => [w.lon, w.lat] as Coord),
    [destination.lon, destination.lat],
  ];

  const url = `${BASE_URL}/v2/directions/${profile}/geojson`;

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({
      coordinates,
      instructions: true,
      language: "en",
      units: "km",
    }),
  });

  return handleResponse(response);
}

// ── Isochrone (reachability zone) ────────────────────────────────────────────
export async function orsIsochrone(params: {
  lat: number;
  lon: number;
  range?: number[];
  range_type?: string;
  profile?: string;
  interval?: number;
  smoothing?: number;
}): Promise<unknown> {
  const {
    lat,
    lon,
    range = [1800],
    range_type = "time",
    profile = "driving-car",
    interval,
    smoothing = 0.25,
  } = params;

  const url = `${BASE_URL}/v2/isochrones/${profile}`;

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      locations: [[lon, lat]],
      range,
      range_type,
      units: "km",
      smoothing,
      ...(interval !== undefined ? { interval } : {}),
    }),
  });

  return handleResponse(response);
}

// ── Distance / Duration Matrix ────────────────────────────────────────────────
export async function orsMatrix(params: {
  locations: Coord[];
  sources?: number[];
  destinations?: number[];
  profile?: string;
  metrics?: string[];
}): Promise<unknown> {
  const {
    locations,
    sources,
    destinations: dests,
    profile = "driving-car",
    metrics = ["duration", "distance"],
  } = params;

  if (!locations || !Array.isArray(locations) || locations.length < 2) {
    throw new Error(
      "locations must be an array of at least 2 [lon, lat] pairs",
    );
  }

  const url = `${BASE_URL}/v2/matrix/${profile}/json`;

  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      locations,
      metrics,
      units: "km",
      ...(sources !== undefined ? { sources } : {}),
      ...(dests !== undefined ? { destinations: dests } : {}),
    }),
  });

  return handleResponse(response);
}

// ── Optimization (TSP / VRP) ──────────────────────────────────────────────────
export async function orsOptimization(params: {
  shipments: unknown[];
  vehicles: unknown[];
}): Promise<unknown> {
  const { shipments, vehicles } = params;

  const response = await fetch(`${BASE_URL}/optimization`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ shipments, vehicles }),
  });

  return handleResponse(response);
}

// ── Forward Geocoding: text → coordinates ────────────────────────────────────
export async function orsGeocode(params: {
  query: string;
  size?: number;
  countryCode?: string;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, size = 5, countryCode, focusLat, focusLon } = params;

  if (!query || query.trim() === "") {
    throw new Error("query is required for geocoding");
  }

  let url =
    `${BASE_URL}/geocode/search` +
    `?api_key=${ORS_API_KEY}` +
    `&text=${encodeURIComponent(query.trim())}` +
    `&size=${size}`;

  if (countryCode) url += `&boundary.country=${countryCode}`;
  if (focusLat !== undefined && focusLon !== undefined) {
    url += `&focus.point.lat=${focusLat}&focus.point.lon=${focusLon}`;
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  return handleResponse(response);
}

// ── Structured Geocoding ─────────────────────────────────────────────────────
export async function orsGeocodeStructured(params: {
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}): Promise<unknown> {
  const { address, city, county, state, country, postalCode } = params;

  const parts: string[] = [`api_key=${ORS_API_KEY}`];
  if (address) parts.push(`address=${encodeURIComponent(address)}`);
  if (city) parts.push(`locality=${encodeURIComponent(city)}`);
  if (county) parts.push(`county=${encodeURIComponent(county)}`);
  if (state) parts.push(`region=${encodeURIComponent(state)}`);
  if (country) parts.push(`country=${encodeURIComponent(country)}`);
  if (postalCode) parts.push(`postalcode=${encodeURIComponent(postalCode)}`);

  const url = `${BASE_URL}/geocode/search/structured?${parts.join("&")}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  return handleResponse(response);
}

// ── Reverse Geocoding: coordinates → address ─────────────────────────────────
export async function orsReverseGeocode(params: {
  lat: number;
  lon: number;
  size?: number;
}): Promise<unknown> {
  const { lat, lon, size = 1 } = params;

  const url =
    `${BASE_URL}/geocode/reverse` +
    `?api_key=${ORS_API_KEY}` +
    `&point.lat=${lat}` +
    `&point.lon=${lon}` +
    `&size=${size}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  return handleResponse(response);
}

// ── Autocomplete ─────────────────────────────────────────────────────────────
export async function orsAutocomplete(params: {
  query: string;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, focusLat, focusLon } = params;

  if (!query || query.trim() === "") {
    throw new Error("query is required for autocomplete");
  }

  let url =
    `${BASE_URL}/geocode/autocomplete` +
    `?api_key=${ORS_API_KEY}` +
    `&text=${encodeURIComponent(query.trim())}`;

  if (focusLat !== undefined && focusLon !== undefined) {
    url += `&focus.point.lat=${focusLat}&focus.point.lon=${focusLon}`;
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  return handleResponse(response);
}

// ── Elevation — single point ─────────────────────────────────────────────────
export async function orsElevationPoint(params: {
  lat: number;
  lon: number;
}): Promise<unknown> {
  const { lat, lon } = params;

  const url =
    `${BASE_URL}/elevation/point` +
    `?api_key=${ORS_API_KEY}` +
    `&geometry={"type":"Point","coordinates":[${lon},${lat}]}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  return handleResponse(response);
}

// ── Elevation — line ─────────────────────────────────────────────────────────
export async function orsElevationLine(params: {
  coordinates: unknown;
}): Promise<unknown> {
  const { coordinates } = params;

  const response = await fetch(`${BASE_URL}/elevation/line`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      format_in: "encodedpolyline5",
      format_out: "encodedpolyline5",
      geometry: coordinates,
    }),
  });

  return handleResponse(response);
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────
export async function openroute(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "directions":
      return orsDirections(params as Parameters<typeof orsDirections>[0]);

    case "directions-geojson":
      return orsDirectionsGeoJson(
        params as Parameters<typeof orsDirectionsGeoJson>[0],
      );

    case "isochrone":
      return orsIsochrone(params as Parameters<typeof orsIsochrone>[0]);

    case "matrix":
      return orsMatrix(params as Parameters<typeof orsMatrix>[0]);

    case "optimization":
      return orsOptimization(params as Parameters<typeof orsOptimization>[0]);

    case "geocode":
      return orsGeocode(params as Parameters<typeof orsGeocode>[0]);

    case "geocode-structured":
      return orsGeocodeStructured(
        params as Parameters<typeof orsGeocodeStructured>[0],
      );

    case "reverse-geocode":
      return orsReverseGeocode(
        params as Parameters<typeof orsReverseGeocode>[0],
      );

    case "autocomplete":
      return orsAutocomplete(params as Parameters<typeof orsAutocomplete>[0]);

    case "elevation-point":
      return orsElevationPoint(
        params as Parameters<typeof orsElevationPoint>[0],
      );

    case "elevation-line":
      return orsElevationLine(params as Parameters<typeof orsElevationLine>[0]);

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: directions, directions-geojson, ` +
          `isochrone, matrix, optimization, geocode, geocode-structured, ` +
          `reverse-geocode, autocomplete, elevation-point, elevation-line`,
      );
  }
}
