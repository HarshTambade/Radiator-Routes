import { ProviderAuthError, readJsonObject, readProviderJson, requireProviderUser } from "../_shared/providerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// ─── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let rateHeaders: Record<string, string> = {};
  try {
    const principal = await requireProviderUser(req, "opentripmap");
    rateHeaders = principal.rateHeaders;
    const OPENTRIPMAP_API_KEY = Deno.env.get("OPENTRIPMAP_API_KEY");
    if (!OPENTRIPMAP_API_KEY) {
      return errorResponse("The place search service is not configured.", 503, rateHeaders);
    }

    const body = await readJsonObject(req, 16_384);
    if (typeof body.action !== "string") {
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

        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
          return errorResponse("lat and lon must be valid coordinates", 400);
        }

        if (!Number.isFinite(radius) || radius < 1 || radius > 100_000) {
          return errorResponse(
            "radius must be between 0 and 100000 metres",
            400,
          );
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) return errorResponse("limit must be from 1 to 50", 400);
        if (typeof kinds !== "string" || kinds.length > 300) return errorResponse("kinds must be a string of at most 300 characters", 400);
        if (rate !== undefined && (!Number.isFinite(rate) || rate < 1 || rate > 3)) return errorResponse("rate must be from 1 to 3", 400);
        if (format !== "json" && format !== "geojson") return errorResponse("format must be json or geojson", 400);

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

        if (typeof xid !== "string" || xid.trim() === "") {
          return errorResponse("xid is required for the 'details' action", 400);
        }
        if (xid.length > 100 || !/^[a-z0-9_-]+$/i.test(xid.trim())) return errorResponse("xid is invalid", 400);

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

        if (typeof name !== "string" || name.trim() === "") {
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
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
          return errorResponse("lat and lon must be valid coordinates", 400);
        }
        if (!Number.isFinite(radius) || radius < 1 || radius > 100_000) return errorResponse("radius must be from 1 to 100000 metres", 400);
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) return errorResponse("limit must be from 1 to 50", 400);
        if (name.length > 200) return errorResponse("name must be 200 characters or fewer", 400);
        if (kinds !== undefined && (typeof kinds !== "string" || kinds.length > 300)) return errorResponse("kinds must be a string of at most 300 characters", 400);

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
        const coords = [bbox.lon_min, bbox.lat_min, bbox.lon_max, bbox.lat_max];
        if (!coords.every(Number.isFinite)
          || bbox.lon_min < -180 || bbox.lon_max > 180
          || bbox.lat_min < -90 || bbox.lat_max > 90
          || bbox.lon_min >= bbox.lon_max || bbox.lat_min >= bbox.lat_max
          || bbox.lon_max - bbox.lon_min > 10 || bbox.lat_max - bbox.lat_min > 10) {
          return errorResponse("bbox coordinates are invalid or cover too large an area", 400);
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) return errorResponse("limit must be from 1 to 50", 400);
        if (typeof kinds !== "string" || kinds.length > 300) return errorResponse("kinds must be a string of at most 300 characters", 400);
        if (rate !== undefined && (!Number.isFinite(rate) || rate < 1 || rate > 3)) return errorResponse("rate must be from 1 to 3", 400);
        if (format !== "json" && format !== "geojson") return errorResponse("format must be json or geojson", 400);

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
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      console.error(`OpenTripMap upstream failed with HTTP ${response.status}`);
      return errorResponse("The place search provider could not complete the request.", response.status >= 500 ? 502 : 400, rateHeaders);
    }

    const data = await readProviderJson(response, 4 * 1024 * 1024);
    return jsonResponse(data, 200, rateHeaders);
  } catch (error: unknown) {
    const status = error instanceof ProviderAuthError ? error.status : error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502;
    const headers = error instanceof ProviderAuthError ? error.headers : rateHeaders;
    if (status >= 500 && !(error instanceof ProviderAuthError)) console.error("OpenTripMap proxy failed", error instanceof Error ? error.name : "unknown_error");
    const message = error instanceof ProviderAuthError ? error.message : status === 504 ? "The place search request timed out. Please retry." : "The place search request could not be completed.";
    return errorResponse(message, status, headers);
  }
});
