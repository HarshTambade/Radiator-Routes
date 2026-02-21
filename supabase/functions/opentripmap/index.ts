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
    const OPENTRIPMAP_API_KEY = Deno.env.get("OPENTRIPMAP_API_KEY");
    if (!OPENTRIPMAP_API_KEY) {
      return errorResponse("OPENTRIPMAP_API_KEY is not configured", 500);
    }

    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action, ...params } = body as {
      action: string;
      lat?: number;
      lon?: number;
      radius?: number;
      kinds?: string;
      limit?: number;
      xid?: string;
      name?: string;
      rate?: number;
      format?: string;
      src_attr?: string;
      bbox?: {
        lon_min: number;
        lat_min: number;
        lon_max: number;
        lat_max: number;
      };
    };

    const baseUrl = "https://api.opentripmap.com/0.1/en/places";
    let url: string;

    // ── action router ─────────────────────────────────────────────────────────

    switch (action) {
      // ── Places within a radius of coordinates ────────────────────────────
      case "radius": {
        const {
          lat,
          lon,
          radius = 5000,
          kinds = "interesting_places",
          limit = 20,
          rate,
          format = "json",
        } = params as {
          lat?: number;
          lon?: number;
          radius?: number;
          kinds?: string;
          limit?: number;
          rate?: number;
          format?: string;
        };

        if (lat === undefined || lon === undefined) {
          return errorResponse(
            "lat and lon are required for the 'radius' action",
            400,
          );
        }

        if (radius < 0 || radius > 100_000) {
          return errorResponse(
            "radius must be between 0 and 100000 metres",
            400,
          );
        }

        url =
          `${baseUrl}/radius` +
          `?radius=${radius}` +
          `&lon=${lon}` +
          `&lat=${lat}` +
          `&kinds=${encodeURIComponent(kinds)}` +
          `&limit=${limit}` +
          `&format=${format}` +
          `&apikey=${OPENTRIPMAP_API_KEY}`;

        if (rate !== undefined) url += `&rate=${rate}`;
        break;
      }

      // ── Place details by OpenTripMap XID ─────────────────────────────────
      case "details": {
        const { xid } = params as { xid?: string };

        if (!xid || xid.trim() === "") {
          return errorResponse("xid is required for the 'details' action", 400);
        }

        url = `${baseUrl}/xid/${encodeURIComponent(xid.trim())}?apikey=${OPENTRIPMAP_API_KEY}`;
        break;
      }

      // ── Autosuggest: search places by name near coordinates ───────────────
      case "autosuggest": {
        const {
          name,
          lat,
          lon,
          radius = 50_000,
          limit = 10,
          kinds,
        } = params as {
          name?: string;
          lat?: number;
          lon?: number;
          radius?: number;
          limit?: number;
          kinds?: string;
        };

        if (!name || name.trim() === "") {
          return errorResponse(
            "name is required for the 'autosuggest' action",
            400,
          );
        }

        if (lat === undefined || lon === undefined) {
          return errorResponse(
            "lat and lon are required for the 'autosuggest' action",
            400,
          );
        }

        url =
          `${baseUrl}/autosuggest` +
          `?name=${encodeURIComponent(name.trim())}` +
          `&radius=${radius}` +
          `&lon=${lon}` +
          `&lat=${lat}` +
          `&limit=${limit}` +
          `&apikey=${OPENTRIPMAP_API_KEY}`;

        if (kinds) url += `&kinds=${encodeURIComponent(kinds)}`;
        break;
      }

      // ── Places within a bounding box ──────────────────────────────────────
      case "bbox": {
        const {
          bbox,
          kinds = "interesting_places",
          limit = 20,
          rate,
          format = "json",
        } = params as {
          bbox?: {
            lon_min: number;
            lat_min: number;
            lon_max: number;
            lat_max: number;
          };
          kinds?: string;
          limit?: number;
          rate?: number;
          format?: string;
        };

        if (
          !bbox ||
          bbox.lon_min === undefined ||
          bbox.lat_min === undefined ||
          bbox.lon_max === undefined ||
          bbox.lat_max === undefined
        ) {
          return errorResponse(
            "bbox object with lon_min, lat_min, lon_max, lat_max is required for the 'bbox' action",
            400,
          );
        }

        url =
          `${baseUrl}/bbox` +
          `?lon_min=${bbox.lon_min}` +
          `&lat_min=${bbox.lat_min}` +
          `&lon_max=${bbox.lon_max}` +
          `&lat_max=${bbox.lat_max}` +
          `&kinds=${encodeURIComponent(kinds)}` +
          `&limit=${limit}` +
          `&format=${format}` +
          `&apikey=${OPENTRIPMAP_API_KEY}`;

        if (rate !== undefined) url += `&rate=${rate}`;
        break;
      }

      // ── Unknown action ────────────────────────────────────────────────────
      default:
        return errorResponse(
          `Unknown action: "${action}". Supported actions: radius, details, autosuggest, bbox`,
          400,
        );
    }

    // ── Execute the OpenTripMap request ───────────────────────────────────────

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`OpenTripMap API error [${response.status}]:`, text);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      return errorResponse(
        `OpenTripMap API error [${response.status}]: ${JSON.stringify(parsed)}`,
        response.status >= 500 ? 502 : response.status,
      );
    }

    const data = await response.json();
    return jsonResponse(data);
  } catch (error: unknown) {
    console.error("OpenTripMap function error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
