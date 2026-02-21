const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action, ...params } = body as {
      action: string;
      query?: string;
      limit?: number;
      lat?: number;
      lon?: number;
    };

    const baseUrl = "https://nominatim.openstreetmap.org";
    const sharedHeaders = {
      "User-Agent": "RadiatorRoutes/2.0 (travel planning app)",
      "Accept-Language": "en",
      Accept: "application/json",
    };

    let url: string;

    // ── action router ─────────────────────────────────────────────────────────

    switch (action) {
      // ── Forward geocoding: text → coordinates ────────────────────────────
      case "search": {
        const { query, limit = 5 } = params as {
          query?: string;
          limit?: number;
        };

        if (!query || query.trim() === "") {
          return errorResponse(
            "query is required for the 'search' action",
            400,
          );
        }

        url =
          `${baseUrl}/search` +
          `?q=${encodeURIComponent(query.trim())}` +
          `&format=json` +
          `&limit=${limit}` +
          `&addressdetails=1` +
          `&extratags=1` +
          `&namedetails=1`;
        break;
      }

      // ── Reverse geocoding: coordinates → address ─────────────────────────
      case "reverse": {
        const { lat, lon } = params as { lat?: number; lon?: number };

        if (lat === undefined || lon === undefined) {
          return errorResponse(
            "lat and lon are required for the 'reverse' action",
            400,
          );
        }

        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          return errorResponse(
            "lat must be in [-90, 90] and lon must be in [-180, 180]",
            400,
          );
        }

        url =
          `${baseUrl}/reverse` +
          `?lat=${lat}` +
          `&lon=${lon}` +
          `&format=json` +
          `&addressdetails=1` +
          `&extratags=1` +
          `&namedetails=1`;
        break;
      }

      // ── Lookup by OSM ID ─────────────────────────────────────────────────
      case "lookup": {
        const { osm_ids } = params as { osm_ids?: string };

        if (!osm_ids || osm_ids.trim() === "") {
          return errorResponse(
            "osm_ids is required for the 'lookup' action (e.g. 'N123,W456')",
            400,
          );
        }

        url =
          `${baseUrl}/lookup` +
          `?osm_ids=${encodeURIComponent(osm_ids.trim())}` +
          `&format=json` +
          `&addressdetails=1`;
        break;
      }

      // ── Unknown action ───────────────────────────────────────────────────
      default:
        return errorResponse(
          `Unknown action: "${action}". Supported actions: search, reverse, lookup`,
          400,
        );
    }

    // ── Execute the Nominatim request ─────────────────────────────────────────

    const response = await fetch(url, { headers: sharedHeaders });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Nominatim error [${response.status}]:`, text);
      return errorResponse(
        `Nominatim API error [${response.status}]: ${text}`,
        502,
      );
    }

    const data = await response.json();

    // Nominatim returns an empty array for no results — treat gracefully
    return jsonResponse(data);
  } catch (error: unknown) {
    console.error("Nominatim function error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
