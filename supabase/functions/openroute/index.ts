import { ProviderAuthError, readJsonObject, readProviderJson, requireProviderUser } from "../_shared/providerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-RateLimit-Remaining-Minute, X-RateLimit-Reset-Minute, X-RateLimit-Remaining-Day, X-RateLimit-Reset-Day",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json", ...extraHeaders },
  });
}

function errorResponse(message: string, status = 500, extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse({ error: message }, status, extraHeaders);
}

type Coord = [number, number]; // [lon, lat]

interface WaypointParam {
  lat: number;
  lon: number;
}

const ROUTE_PROFILES = new Set([
  "driving-car", "driving-hgv", "cycling-regular", "cycling-road",
  "cycling-mountain", "cycling-electric", "foot-walking", "foot-hiking",
]);

function isCoord(value: unknown): value is WaypointParam {
  if (!value || typeof value !== "object") return false;
  const point = value as { lat?: unknown; lon?: unknown };
  return typeof point.lat === "number" && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && typeof point.lon === "number" && Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180;
}

// ─── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let rateHeaders: Record<string, string> = {};
  try {
    const principal = await requireProviderUser(req, "ors");
    rateHeaders = principal.rateHeaders;
    const ORS_API_KEY = Deno.env.get("ORS_API_KEY");
    if (!ORS_API_KEY) {
      return errorResponse("The routing service is not configured.", 503, rateHeaders);
    }

    const body = await readJsonObject(req, 262_144);
    if (typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action, ...params } = body as {
      action: string;
      [key: string]: unknown;
    };
    const baseUrl = "https://api.heigit.org";

    // Common ORS auth headers
    const orsHeaders = {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    let url: string;
    let fetchOptions: RequestInit = {};

    // ── action router ─────────────────────────────────────────────────────────

    switch (action) {
      // ── Directions (JSON) ─────────────────────────────────────────────────
      case "directions": {
        const {
          origin,
          destination,
          profile = "driving-car",
          alternatives = false,
          waypoints = [],
          elevation = false,
        } = params as {
          origin: WaypointParam;
          destination: WaypointParam;
          profile?: string;
          alternatives?: boolean;
          waypoints?: WaypointParam[];
          elevation?: boolean;
        };

        if (!origin || !destination) {
          return errorResponse("origin and destination are required", 400);
        }
        if (!isCoord(origin) || !isCoord(destination) || !Array.isArray(waypoints) || waypoints.length > 25 || !waypoints.every(isCoord)) {
          return errorResponse("origin, destination, and waypoints must contain valid coordinates (up to 25 waypoints)", 400);
        }
        if (!ROUTE_PROFILES.has(profile)) return errorResponse("profile is not supported", 400);
        if (typeof alternatives !== "boolean") return errorResponse("alternatives must be a boolean", 400);
        if (typeof elevation !== "boolean") return errorResponse("elevation must be a boolean", 400);

        const coordinates: Coord[] = [
          [origin.lon, origin.lat],
          ...waypoints.map((w) => [w.lon, w.lat] as Coord),
          [destination.lon, destination.lat],
        ];

        url = `${baseUrl}/openrouteservice/v2/directions/${profile}/json`;
        fetchOptions = {
          method: "POST",
          headers: orsHeaders,
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
            elevation,
          }),
        };
        break;
      }

      // ── Directions (GeoJSON) ──────────────────────────────────────────────
      case "directions-geojson": {
        const {
          origin,
          destination,
          profile = "driving-car",
          waypoints = [],
        } = params as {
          origin: WaypointParam;
          destination: WaypointParam;
          profile?: string;
          waypoints?: WaypointParam[];
        };

        if (!origin || !destination) {
          return errorResponse("origin and destination are required", 400);
        }
        if (!isCoord(origin) || !isCoord(destination) || !Array.isArray(waypoints) || waypoints.length > 25 || !waypoints.every(isCoord)) {
          return errorResponse("origin, destination, and waypoints must contain valid coordinates (up to 25 waypoints)", 400);
        }
        if (!ROUTE_PROFILES.has(profile)) return errorResponse("profile is not supported", 400);

        const coordinates: Coord[] = [
          [origin.lon, origin.lat],
          ...waypoints.map((w) => [w.lon, w.lat] as Coord),
          [destination.lon, destination.lat],
        ];

        url = `${baseUrl}/openrouteservice/v2/directions/${profile}/geojson`;
        fetchOptions = {
          method: "POST",
          headers: {
            ...orsHeaders,
            Accept: "application/json, application/geo+json",
          },
          body: JSON.stringify({
            coordinates,
            instructions: true,
            language: "en",
            units: "km",
          }),
        };
        break;
      }

      // ── Isochrone (reachability zone) ─────────────────────────────────────
      case "isochrone": {
        const {
          lat,
          lon,
          range = [1800],
          range_type = "time",
          profile = "driving-car",
          interval,
          smoothing = 0.25,
        } = params as {
          lat: number;
          lon: number;
          range?: number[];
          range_type?: string;
          profile?: string;
          interval?: number;
          smoothing?: number;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return errorResponse("lat and lon must be valid coordinates", 400);
        if (!ROUTE_PROFILES.has(profile)) return errorResponse("profile is not supported", 400);
        if (!Array.isArray(range) || range.length < 1 || range.length > 3 || !range.every((n) => Number.isFinite(n) && n > 0 && n <= 100_000)) return errorResponse("range must contain one to three positive values no greater than 100000", 400);
        if (range_type !== "time" && range_type !== "distance") return errorResponse("range_type must be time or distance", 400);
        if (!Number.isFinite(smoothing) || smoothing < 0 || smoothing > 1) return errorResponse("smoothing must be from 0 to 1", 400);
        if (interval !== undefined && (!Number.isFinite(interval) || interval <= 0 || interval > Math.max(...range))) return errorResponse("interval must be positive and no greater than the requested range", 400);

        url = `${baseUrl}/openrouteservice/v2/isochrones/${profile}`;
        fetchOptions = {
          method: "POST",
          headers: orsHeaders,
          body: JSON.stringify({
            locations: [[lon, lat]],
            range,
            range_type,
            units: "km",
            smoothing,
            ...(interval !== undefined ? { interval } : {}),
          }),
        };
        break;
      }

      // ── Distance / Duration Matrix ────────────────────────────────────────
      case "matrix": {
        const {
          locations,
          sources,
          destinations: dests,
          profile = "driving-car",
          metrics = ["duration", "distance"],
        } = params as {
          locations: Coord[];
          sources?: number[];
          destinations?: number[];
          profile?: string;
          metrics?: string[];
        };

        if (!locations || !Array.isArray(locations) || locations.length < 2) {
          return errorResponse(
            "locations must be an array of at least 2 [lon, lat] pairs",
            400,
          );
        }
        if (locations.length > 50 || !locations.every((point) => Array.isArray(point) && point.length === 2
          && Number.isFinite(point[0]) && point[0] >= -180 && point[0] <= 180
          && Number.isFinite(point[1]) && point[1] >= -90 && point[1] <= 90)) {
          return errorResponse("locations must contain 2 to 50 valid [longitude, latitude] pairs", 400);
        }
        if (!ROUTE_PROFILES.has(profile)) return errorResponse("profile is not supported", 400);
        if (!Array.isArray(metrics) || metrics.length < 1 || metrics.length > 2 || !metrics.every((metric) => metric === "duration" || metric === "distance")) return errorResponse("metrics may include duration and/or distance", 400);

        url = `${baseUrl}/openrouteservice/v2/matrix/${profile}/json`;
        fetchOptions = {
          method: "POST",
          headers: orsHeaders,
          body: JSON.stringify({
            locations,
            metrics,
            units: "km",
            ...(sources !== undefined ? { sources } : {}),
            ...(dests !== undefined ? { destinations: dests } : {}),
          }),
        };
        break;
      }

      // ── Optimization (TSP / VRP) ──────────────────────────────────────────
      case "optimization": {
        const { shipments, vehicles } = params as {
          shipments: unknown[];
          vehicles: unknown[];
        };

        if (!Array.isArray(shipments) || shipments.length > 50 || !Array.isArray(vehicles) || vehicles.length < 1 || vehicles.length > 10) {
          return errorResponse("optimization requires up to 50 shipments and from 1 to 10 vehicles", 400);
        }

        if (!shipments || !vehicles) {
          return errorResponse("shipments and vehicles are required", 400);
        }

        url = `${baseUrl}/vroom/v0`;
        fetchOptions = {
          method: "POST",
          headers: orsHeaders,
          body: JSON.stringify({ shipments, vehicles }),
        };
        break;
      }

      // ── Forward Geocoding: text → coordinates ─────────────────────────────
      case "geocode": {
        const {
          query,
          size = 5,
          countryCode,
          focusLat,
          focusLon,
        } = params as {
          query: string;
          size?: number;
          countryCode?: string;
          focusLat?: number;
          focusLon?: number;
        };

        if (typeof query !== "string" || query.trim() === "") {
          return errorResponse("query is required", 400);
        }
        if (query.length > 200 || !Number.isInteger(size) || size < 1 || size > 10) return errorResponse("query must be at most 200 characters and size from 1 to 10", 400);
        if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) return errorResponse("countryCode must be a two-letter ISO code", 400);
        if ((focusLat === undefined) !== (focusLon === undefined) || (focusLat !== undefined && (!Number.isFinite(focusLat) || focusLat < -90 || focusLat > 90 || !Number.isFinite(focusLon) || focusLon! < -180 || focusLon! > 180))) return errorResponse("focus coordinates must be valid", 400);

        const geocodeUrl = new URL("/pelias/v1/search", baseUrl);
        geocodeUrl.searchParams.set("text", query.trim());
        geocodeUrl.searchParams.set("size", String(size));
        if (countryCode) geocodeUrl.searchParams.set("boundary.country", countryCode);
        if (focusLat !== undefined && focusLon !== undefined) {
          geocodeUrl.searchParams.set("focus.point.lat", String(focusLat));
          geocodeUrl.searchParams.set("focus.point.lon", String(focusLon));
        }
        url = geocodeUrl.toString();
        break;
      }

      // ── Structured Geocoding ──────────────────────────────────────────────
      case "geocode-structured": {
        const { address, city, county, state, country, postalCode } =
          params as {
            address?: string;
            city?: string;
            county?: string;
            state?: string;
            country?: string;
            postalCode?: string;
          };

        if (![address, city, county, state, country, postalCode].some((value) => typeof value === "string" && value.trim())) {
          return errorResponse("At least one address field is required", 400);
        }
        if ([address, city, county, state, country, postalCode].some((value) => value !== undefined && (typeof value !== "string" || value.length > 200))) {
          return errorResponse("Address fields must be strings of at most 200 characters", 400);
        }

        const structuredUrl = new URL("/pelias/v1/search/structured", baseUrl);
        if (address) structuredUrl.searchParams.set("address", address.trim());
        if (city) structuredUrl.searchParams.set("locality", city.trim());
        if (county) structuredUrl.searchParams.set("county", county.trim());
        if (state) structuredUrl.searchParams.set("region", state.trim());
        if (country) structuredUrl.searchParams.set("country", country.trim());
        if (postalCode) structuredUrl.searchParams.set("postalcode", postalCode.trim());
        url = structuredUrl.toString();
        break;
      }

      // ── Reverse Geocoding: coordinates → address ──────────────────────────
      case "reverse-geocode": {
        const {
          lat,
          lon,
          size = 1,
        } = params as {
          lat: number;
          lon: number;
          size?: number;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isInteger(size) || size < 1 || size > 10) return errorResponse("coordinates and size are invalid", 400);

        const reverseUrl = new URL("/pelias/v1/reverse", baseUrl);
        reverseUrl.searchParams.set("point.lat", String(lat));
        reverseUrl.searchParams.set("point.lon", String(lon));
        reverseUrl.searchParams.set("size", String(size));
        url = reverseUrl.toString();
        break;
      }

      // ── Autocomplete ──────────────────────────────────────────────────────
      case "autocomplete": {
        const { query, focusLat, focusLon } = params as {
          query: string;
          focusLat?: number;
          focusLon?: number;
        };

        if (typeof query !== "string" || query.trim() === "") {
          return errorResponse("query is required", 400);
        }
        if (query.length > 200) return errorResponse("query must be 200 characters or fewer", 400);
        if ((focusLat === undefined) !== (focusLon === undefined) || (focusLat !== undefined && (!Number.isFinite(focusLat) || focusLat < -90 || focusLat > 90 || !Number.isFinite(focusLon) || focusLon! < -180 || focusLon! > 180))) return errorResponse("focus coordinates must be valid", 400);

        const autocompleteUrl = new URL("/pelias/v1/autocomplete", baseUrl);
        autocompleteUrl.searchParams.set("text", query.trim());
        if (focusLat !== undefined && focusLon !== undefined) {
          autocompleteUrl.searchParams.set("focus.point.lat", String(focusLat));
          autocompleteUrl.searchParams.set("focus.point.lon", String(focusLon));
        }
        url = autocompleteUrl.toString();
        break;
      }

      // ── Elevation — single point ──────────────────────────────────────────
      case "elevation-point": {
        const { lat, lon } = params as { lat: number; lon: number };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return errorResponse("lat and lon must be valid coordinates", 400);

        const elevationUrl = new URL("/openelevationservice/v0/point", baseUrl);
        elevationUrl.searchParams.set("geometry", JSON.stringify({ type: "Point", coordinates: [lon, lat] }));
        url = elevationUrl.toString();
        break;
      }

      // ── Elevation — line ──────────────────────────────────────────────────
      case "elevation-line": {
        const { coordinates } = params as { coordinates: unknown };

        if (typeof coordinates !== "string" && !Array.isArray(coordinates)) {
          return errorResponse("coordinates are required", 400);
        }
        if (typeof coordinates === "string" ? coordinates.length > 100_000 : coordinates.length > 500) {
          return errorResponse("coordinates are too large", 400);
        }

        url = `${baseUrl}/openelevationservice/v0/line`;
        fetchOptions = {
          method: "POST",
          headers: orsHeaders,
          body: JSON.stringify({
            format_in: "encodedpolyline5",
            format_out: "encodedpolyline5",
            geometry: coordinates,
          }),
        };
        break;
      }

      // ── Unknown ───────────────────────────────────────────────────────────
      default:
        return errorResponse(
          `Unknown action: "${action}". Supported: directions, directions-geojson, ` +
            `isochrone, matrix, optimization, geocode, geocode-structured, ` +
            `reverse-geocode, autocomplete, elevation-point, elevation-line`,
          400,
        );
    }

    // ── Execute the ORS request ───────────────────────────────────────────────

    const isPost = fetchOptions.method === "POST";
    const response = isPost
      ? await fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(15_000) })
      : await fetch(url, { headers: { Authorization: ORS_API_KEY, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });

    if (!response.ok) {
      console.error(`OpenRouteService upstream failed with HTTP ${response.status}`);
      // A provider quota hit is a retryable 429 and a rejected server key is a
      // deployment fault (502); neither is a bad request from the client.
      const status = response.status === 429 ? 429
        : response.status >= 500 || response.status === 401 || response.status === 403 ? 502
        : 400;
      return errorResponse("The routing provider could not complete the request.", status, rateHeaders);
    }

    const data = await readProviderJson(response, 4 * 1024 * 1024);
    return jsonResponse(data, 200, rateHeaders);
  } catch (error: unknown) {
    const status = error instanceof ProviderAuthError ? error.status : error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502;
    const headers = error instanceof ProviderAuthError ? error.headers : rateHeaders;
    if (status >= 500 && !(error instanceof ProviderAuthError)) console.error("OpenRouteService proxy failed", error instanceof Error ? error.name : "unknown_error");
    const message = error instanceof ProviderAuthError ? error.message : status === 504 ? "The routing request timed out. Please retry." : "The routing request could not be completed.";
    return errorResponse(message, status, headers);
  }
});
