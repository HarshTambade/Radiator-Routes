// TomTom Traffic Monitoring API service
// Calls TomTom APIs directly from the browser — no Supabase edge function needed

const TRAFFIC_API_KEY = import.meta.env.VITE_TRAFFIC_API_KEY as string;
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string;

const TOMTOM_BASE = "https://api.tomtom.com";
const ORS_BASE = "https://api.openrouteservice.org";

type Coord = [number, number]; // [lon, lat]

interface WaypointParam {
  lat: number;
  lon: number;
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
      `API error [${response.status}]: ${JSON.stringify(parsed)}`,
    );
  }
  return response.json();
}

// ── Traffic flow at a point ──────────────────────────────────────────────────
export async function trafficFlow(params: {
  lat: number;
  lon: number;
  zoom?: number;
}): Promise<unknown> {
  const { lat, lon, zoom = 10 } = params;

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required");
  }

  const url =
    `${TOMTOM_BASE}/traffic/services/4/flowSegmentData/absolute/${zoom}/json` +
    `?point=${lat},${lon}` +
    `&key=${TRAFFIC_API_KEY}`;

  const response = await fetch(url);
  return handleResponse(response);
}

// ── Traffic incidents in a bounding box ────────────────────────────────────
export async function trafficIncidents(params: {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}): Promise<unknown> {
  const { minLat, minLon, maxLat, maxLon } = params;

  if (
    minLat === undefined ||
    minLon === undefined ||
    maxLat === undefined ||
    maxLon === undefined
  ) {
    throw new Error("minLat, minLon, maxLat and maxLon are required");
  }

  const fields = encodeURIComponent(
    "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}",
  );

  const url =
    `${TOMTOM_BASE}/traffic/services/5/incidentDetails` +
    `?key=${TRAFFIC_API_KEY}` +
    `&bbox=${minLon},${minLat},${maxLon},${maxLat}` +
    `&fields=${fields}` +
    `&language=en-GB` +
    `&t=1111` +
    `&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11` +
    `&timeValidityFilter=present`;

  const response = await fetch(url);
  return handleResponse(response);
}

// ── Place / POI search ───────────────────────────────────────────────────────
export async function tomtomSearch(params: {
  query: string;
  lat?: number;
  lon?: number;
  radius?: number;
  limit?: number;
}): Promise<unknown> {
  const { query, lat, lon, radius = 50000, limit = 10 } = params;

  if (!query || query.trim() === "") {
    throw new Error("query is required");
  }

  let url =
    `${TOMTOM_BASE}/search/2/search/${encodeURIComponent(query.trim())}.json` +
    `?key=${TRAFFIC_API_KEY}` +
    `&limit=${limit}`;

  if (lat !== undefined && lon !== undefined) {
    url += `&lat=${lat}&lon=${lon}&radius=${radius}`;
  }

  const response = await fetch(url);
  return handleResponse(response);
}

// ── Category search near coordinates ────────────────────────────────────────
export async function tomtomCategorySearch(params: {
  query: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  categorySet?: string;
}): Promise<unknown> {
  const { query, lat, lon, radius = 10000, limit = 10, categorySet } = params;

  if (!query || query.trim() === "") {
    throw new Error("query is required");
  }

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required");
  }

  let url =
    `${TOMTOM_BASE}/search/2/categorySearch/${encodeURIComponent(query.trim())}.json` +
    `?key=${TRAFFIC_API_KEY}` +
    `&lat=${lat}` +
    `&lon=${lon}` +
    `&radius=${radius}` +
    `&limit=${limit}`;

  if (categorySet) url += `&categorySet=${categorySet}`;

  const response = await fetch(url);
  return handleResponse(response);
}

// ── Nearby search ────────────────────────────────────────────────────────────
export async function tomtomNearbySearch(params: {
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  categorySet?: string;
}): Promise<unknown> {
  const { lat, lon, radius = 1000, limit = 10, categorySet } = params;

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required");
  }

  let url =
    `${TOMTOM_BASE}/search/2/nearbySearch/.json` +
    `?key=${TRAFFIC_API_KEY}` +
    `&lat=${lat}` +
    `&lon=${lon}` +
    `&radius=${radius}` +
    `&limit=${limit}`;

  if (categorySet) url += `&categorySet=${categorySet}`;

  const response = await fetch(url);
  return handleResponse(response);
}

// ── Route calculation (OpenRouteService) ────────────────────────────────────
export async function trafficRoute(params: {
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

  if (!origin || !destination) {
    throw new Error("origin and destination are required");
  }

  const coordinates: Coord[] = [
    [origin.lon, origin.lat],
    ...waypoints.map((w) => [w.lon, w.lat] as Coord),
    [destination.lon, destination.lat],
  ];

  const url = `${ORS_BASE}/v2/directions/${profile}/json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      coordinates,
      alternative_routes: alternatives
        ? { target_count: 3, weight_factor: 1.6 }
        : undefined,
      instructions: true,
      instructions_format: "text",
      language: "en",
      units: "km",
      geometry: true,
    }),
  });

  return handleResponse(response);
}

// ── Isochrone / reachability zone (OpenRouteService) ────────────────────────
export async function trafficIsochrone(params: {
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

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required");
  }

  const url = `${ORS_BASE}/v2/isochrones/${profile}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
    },
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

// ── Distance / Duration Matrix (OpenRouteService) ───────────────────────────
export async function trafficMatrix(params: {
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

  const url = `${ORS_BASE}/v2/matrix/${profile}/json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
    },
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

// ── Forward geocoding (OpenRouteService) ────────────────────────────────────
export async function trafficGeocode(params: {
  query: string;
  size?: number;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  const { query, size = 5, focusLat, focusLon } = params;

  if (!query || query.trim() === "") {
    throw new Error("query is required");
  }

  let url =
    `${ORS_BASE}/geocode/search` +
    `?api_key=${ORS_API_KEY}` +
    `&text=${encodeURIComponent(query.trim())}` +
    `&size=${size}`;

  if (focusLat !== undefined && focusLon !== undefined) {
    url += `&focus.point.lat=${focusLat}&focus.point.lon=${focusLon}`;
  }

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return handleResponse(response);
}

// ── Reverse geocoding (OpenRouteService) ────────────────────────────────────
export async function trafficReverseGeocode(params: {
  lat: number;
  lon: number;
  size?: number;
}): Promise<unknown> {
  const { lat, lon, size = 1 } = params;

  if (lat === undefined || lon === undefined) {
    throw new Error("lat and lon are required");
  }

  const url =
    `${ORS_BASE}/geocode/reverse` +
    `?api_key=${ORS_API_KEY}` +
    `&point.lat=${lat}` +
    `&point.lon=${lon}` +
    `&size=${size}`;

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  return handleResponse(response);
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ────
export async function tomtom(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "traffic-flow":
      return trafficFlow(params as Parameters<typeof trafficFlow>[0]);

    case "traffic-incidents":
      return trafficIncidents(params as Parameters<typeof trafficIncidents>[0]);

    case "search":
      return tomtomSearch(params as Parameters<typeof tomtomSearch>[0]);

    case "category-search":
      return tomtomCategorySearch(
        params as Parameters<typeof tomtomCategorySearch>[0],
      );

    case "nearby-search":
      return tomtomNearbySearch(
        params as Parameters<typeof tomtomNearbySearch>[0],
      );

    case "route":
      return trafficRoute(params as Parameters<typeof trafficRoute>[0]);

    case "isochrone":
      return trafficIsochrone(params as Parameters<typeof trafficIsochrone>[0]);

    case "matrix":
      return trafficMatrix(params as Parameters<typeof trafficMatrix>[0]);

    case "geocode":
      return trafficGeocode(params as Parameters<typeof trafficGeocode>[0]);

    case "reverse-geocode":
      return trafficReverseGeocode(
        params as Parameters<typeof trafficReverseGeocode>[0],
      );

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: ` +
          `traffic-flow, traffic-incidents, search, category-search, nearby-search, ` +
          `route, isochrone, matrix, geocode, reverse-geocode`,
      );
  }
}
