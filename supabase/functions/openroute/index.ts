import { createClient as _createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

type Coord = [number, number]; // [lon, lat]

interface WaypointParam {
  lat: number;
  lon: number;
}

// ─── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const ORS_API_KEY = Deno.env.get("ORS_API_KEY");
    if (!ORS_API_KEY) {
      return errorResponse("ORS_API_KEY is not configured", 500);
    }

    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action, ...params } = body as {
      action: string;
      [key: string]: unknown;
    };
    const baseUrl = "https://api.openrouteservice.org";

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
        } = params as {
          origin: WaypointParam;
          destination: WaypointParam;
          profile?: string;
          alternatives?: boolean;
          waypoints?: WaypointParam[];
        };

        if (!origin || !destination) {
          return errorResponse("origin and destination are required", 400);
        }

        const coordinates: Coord[] = [
          [origin.lon, origin.lat],
          ...waypoints.map((w) => [w.lon, w.lat] as Coord),
          [destination.lon, destination.lat],
        ];

        url = `${baseUrl}/v2/directions/${profile}/json`;
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
            elevation: false,
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

        const coordinates: Coord[] = [
          [origin.lon, origin.lat],
          ...waypoints.map((w) => [w.lon, w.lat] as Coord),
          [destination.lon, destination.lat],
        ];

        url = `${baseUrl}/v2/directions/${profile}/geojson`;
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

        url = `${baseUrl}/v2/isochrones/${profile}`;
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

        url = `${baseUrl}/v2/matrix/${profile}/json`;
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

        if (!shipments || !vehicles) {
          return errorResponse("shipments and vehicles are required", 400);
        }

        url = `${baseUrl}/optimization`;
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

        if (!query || query.trim() === "") {
          return errorResponse("query is required", 400);
        }

        url =
          `${baseUrl}/geocode/search` +
          `?api_key=${ORS_API_KEY}` +
          `&text=${encodeURIComponent(query.trim())}` +
          `&size=${size}`;

        if (countryCode) url += `&boundary.country=${countryCode}`;
        if (focusLat !== undefined && focusLon !== undefined) {
          url += `&focus.point.lat=${focusLat}&focus.point.lon=${focusLon}`;
        }
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

        const parts: string[] = [`api_key=${ORS_API_KEY}`];
        if (address) parts.push(`address=${encodeURIComponent(address)}`);
        if (city) parts.push(`locality=${encodeURIComponent(city)}`);
        if (county) parts.push(`county=${encodeURIComponent(county)}`);
        if (state) parts.push(`region=${encodeURIComponent(state)}`);
        if (country) parts.push(`country=${encodeURIComponent(country)}`);
        if (postalCode)
          parts.push(`postalcode=${encodeURIComponent(postalCode)}`);

        url = `${baseUrl}/geocode/search/structured?${parts.join("&")}`;
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

        url =
          `${baseUrl}/geocode/reverse` +
          `?api_key=${ORS_API_KEY}` +
          `&point.lat=${lat}` +
          `&point.lon=${lon}` +
          `&size=${size}`;
        break;
      }

      // ── Autocomplete ──────────────────────────────────────────────────────
      case "autocomplete": {
        const { query, focusLat, focusLon } = params as {
          query: string;
          focusLat?: number;
          focusLon?: number;
        };

        if (!query || query.trim() === "") {
          return errorResponse("query is required", 400);
        }

        url =
          `${baseUrl}/geocode/autocomplete` +
          `?api_key=${ORS_API_KEY}` +
          `&text=${encodeURIComponent(query.trim())}`;

        if (focusLat !== undefined && focusLon !== undefined) {
          url += `&focus.point.lat=${focusLat}&focus.point.lon=${focusLon}`;
        }
        break;
      }

      // ── Elevation — single point ──────────────────────────────────────────
      case "elevation-point": {
        const { lat, lon } = params as { lat: number; lon: number };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }

        url =
          `${baseUrl}/elevation/point` +
          `?api_key=${ORS_API_KEY}` +
          `&geometry={"type":"Point","coordinates":[${lon},${lat}]}`;
        break;
      }

      // ── Elevation — line ──────────────────────────────────────────────────
      case "elevation-line": {
        const { coordinates } = params as { coordinates: unknown };

        if (!coordinates) {
          return errorResponse("coordinates are required", 400);
        }

        url = `${baseUrl}/elevation/line`;
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
      ? await fetch(url, fetchOptions)
      : await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      const text = await response.text();
      console.error(`OpenRouteService error [${response.status}]:`, text);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      return errorResponse(
        `OpenRouteService error [${response.status}]: ${JSON.stringify(parsed)}`,
        response.status >= 500 ? 502 : response.status,
      );
    }

    const data = await response.json();
    return jsonResponse(data);
  } catch (error: unknown) {
    console.error("OpenRouteService function error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
