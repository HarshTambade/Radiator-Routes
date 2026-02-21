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

interface WaypointParam {
  lat: number;
  lon: number;
}

type Coord = [number, number]; // [lon, lat]

// ─── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const TRAFFIC_API_KEY = Deno.env.get("TRAFFIC_API_KEY");
    const ORS_API_KEY = Deno.env.get("ORS_API_KEY");

    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action, ...params } = body as {
      action: string;
      [key: string]: unknown;
    };

    const tomtomBase = "https://api.tomtom.com";
    const orsBase = "https://api.openrouteservice.org";

    let url: string;
    let fetchOptions: RequestInit = {};

    // ── action router ─────────────────────────────────────────────────────────

    switch (action) {
      // ── Traffic flow at a point (TomTom) ─────────────────────────────────
      case "traffic-flow": {
        if (!TRAFFIC_API_KEY) {
          return errorResponse("TRAFFIC_API_KEY is not configured", 500);
        }

        const {
          lat,
          lon,
          zoom = 10,
        } = params as {
          lat?: number;
          lon?: number;
          zoom?: number;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }

        url =
          `${tomtomBase}/traffic/services/4/flowSegmentData/absolute/${zoom}/json` +
          `?point=${lat},${lon}` +
          `&key=${TRAFFIC_API_KEY}`;
        break;
      }

      // ── Traffic incidents in a bounding box (TomTom) ──────────────────────
      case "traffic-incidents": {
        if (!TRAFFIC_API_KEY) {
          return errorResponse("TRAFFIC_API_KEY is not configured", 500);
        }

        const { minLat, minLon, maxLat, maxLon } = params as {
          minLat?: number;
          minLon?: number;
          maxLat?: number;
          maxLon?: number;
        };

        if (
          minLat === undefined ||
          minLon === undefined ||
          maxLat === undefined ||
          maxLon === undefined
        ) {
          return errorResponse(
            "minLat, minLon, maxLat and maxLon are required",
            400,
          );
        }

        const fields = encodeURIComponent(
          "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}",
        );

        url =
          `${tomtomBase}/traffic/services/5/incidentDetails` +
          `?key=${TRAFFIC_API_KEY}` +
          `&bbox=${minLon},${minLat},${maxLon},${maxLat}` +
          `&fields=${fields}` +
          `&language=en-GB` +
          `&t=1111` +
          `&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11` +
          `&timeValidityFilter=present`;
        break;
      }

      // ── Place / POI search (TomTom) ───────────────────────────────────────
      case "search": {
        if (!TRAFFIC_API_KEY) {
          return errorResponse("TRAFFIC_API_KEY is not configured", 500);
        }

        const {
          query,
          lat,
          lon,
          radius = 50000,
          limit = 10,
        } = params as {
          query?: string;
          lat?: number;
          lon?: number;
          radius?: number;
          limit?: number;
        };

        if (!query || query.trim() === "") {
          return errorResponse("query is required", 400);
        }

        url =
          `${tomtomBase}/search/2/search/${encodeURIComponent(query.trim())}.json` +
          `?key=${TRAFFIC_API_KEY}` +
          `&limit=${limit}`;

        if (lat !== undefined && lon !== undefined) {
          url += `&lat=${lat}&lon=${lon}&radius=${radius}`;
        }
        break;
      }

      // ── Category search near coordinates (TomTom) ─────────────────────────
      case "category-search": {
        if (!TRAFFIC_API_KEY) {
          return errorResponse("TRAFFIC_API_KEY is not configured", 500);
        }

        const {
          query,
          lat,
          lon,
          radius = 10000,
          limit = 10,
          categorySet,
        } = params as {
          query?: string;
          lat?: number;
          lon?: number;
          radius?: number;
          limit?: number;
          categorySet?: string;
        };

        if (!query || query.trim() === "") {
          return errorResponse("query is required", 400);
        }

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }

        url =
          `${tomtomBase}/search/2/categorySearch/${encodeURIComponent(query.trim())}.json` +
          `?key=${TRAFFIC_API_KEY}` +
          `&lat=${lat}` +
          `&lon=${lon}` +
          `&radius=${radius}` +
          `&limit=${limit}`;

        if (categorySet) url += `&categorySet=${categorySet}`;
        break;
      }

      // ── Nearby search (TomTom) ────────────────────────────────────────────
      case "nearby-search": {
        if (!TRAFFIC_API_KEY) {
          return errorResponse("TRAFFIC_API_KEY is not configured", 500);
        }

        const {
          lat,
          lon,
          radius = 1000,
          limit = 10,
          categorySet,
        } = params as {
          lat?: number;
          lon?: number;
          radius?: number;
          limit?: number;
          categorySet?: string;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }

        url =
          `${tomtomBase}/search/2/nearbySearch/.json` +
          `?key=${TRAFFIC_API_KEY}` +
          `&lat=${lat}` +
          `&lon=${lon}` +
          `&radius=${radius}` +
          `&limit=${limit}`;

        if (categorySet) url += `&categorySet=${categorySet}`;
        break;
      }

      // ── Route calculation (OpenRouteService) ──────────────────────────────
      case "route": {
        if (!ORS_API_KEY) {
          return errorResponse("ORS_API_KEY is not configured", 500);
        }

        const {
          origin,
          destination,
          profile = "driving-car",
          alternatives = false,
          waypoints = [],
        } = params as {
          origin?: WaypointParam;
          destination?: WaypointParam;
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

        url = `${orsBase}/v2/directions/${profile}/json`;
        fetchOptions = {
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
        };
        break;
      }

      // ── Isochrone / reachability zone (OpenRouteService) ─────────────────
      case "isochrone": {
        if (!ORS_API_KEY) {
          return errorResponse("ORS_API_KEY is not configured", 500);
        }

        const {
          lat,
          lon,
          range = [1800],
          range_type = "time",
          profile = "driving-car",
          interval,
          smoothing = 0.25,
        } = params as {
          lat?: number;
          lon?: number;
          range?: number[];
          range_type?: string;
          profile?: string;
          interval?: number;
          smoothing?: number;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }

        url = `${orsBase}/v2/isochrones/${profile}`;
        fetchOptions = {
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
        };
        break;
      }

      // ── Distance / Duration Matrix (OpenRouteService) ─────────────────────
      case "matrix": {
        if (!ORS_API_KEY) {
          return errorResponse("ORS_API_KEY is not configured", 500);
        }

        const {
          locations,
          sources,
          destinations: dests,
          profile = "driving-car",
          metrics = ["duration", "distance"],
        } = params as {
          locations?: Coord[];
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

        url = `${orsBase}/v2/matrix/${profile}/json`;
        fetchOptions = {
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
        };
        break;
      }

      // ── Forward geocoding (OpenRouteService) ──────────────────────────────
      case "geocode": {
        if (!ORS_API_KEY) {
          return errorResponse("ORS_API_KEY is not configured", 500);
        }

        const {
          query,
          size = 5,
          focusLat,
          focusLon,
        } = params as {
          query?: string;
          size?: number;
          focusLat?: number;
          focusLon?: number;
        };

        if (!query || query.trim() === "") {
          return errorResponse("query is required", 400);
        }

        url =
          `${orsBase}/geocode/search` +
          `?api_key=${ORS_API_KEY}` +
          `&text=${encodeURIComponent(query.trim())}` +
          `&size=${size}`;

        if (focusLat !== undefined && focusLon !== undefined) {
          url += `&focus.point.lat=${focusLat}&focus.point.lon=${focusLon}`;
        }
        break;
      }

      // ── Reverse geocoding (OpenRouteService) ──────────────────────────────
      case "reverse-geocode": {
        if (!ORS_API_KEY) {
          return errorResponse("ORS_API_KEY is not configured", 500);
        }

        const {
          lat,
          lon,
          size = 1,
        } = params as {
          lat?: number;
          lon?: number;
          size?: number;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse("lat and lon are required", 400);
        }

        url =
          `${orsBase}/geocode/reverse` +
          `?api_key=${ORS_API_KEY}` +
          `&point.lat=${lat}` +
          `&point.lon=${lon}` +
          `&size=${size}`;
        break;
      }

      // ── Unknown action ────────────────────────────────────────────────────
      default:
        return errorResponse(
          `Unknown action: "${action}". Supported: ` +
            `traffic-flow, traffic-incidents, search, category-search, nearby-search, ` +
            `route, isochrone, matrix, geocode, reverse-geocode`,
          400,
        );
    }

    // ── Execute the request ───────────────────────────────────────────────────

    const isPost = fetchOptions.method === "POST";
    const response = isPost ? await fetch(url, fetchOptions) : await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error(`API error [${response.status}]:`, text);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      return errorResponse(
        `API error [${response.status}]: ${JSON.stringify(parsed)}`,
        response.status >= 500 ? 502 : response.status,
      );
    }

    const data = await response.json();
    return jsonResponse(data);
  } catch (error: unknown) {
    console.error("TomTom/Route function error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
