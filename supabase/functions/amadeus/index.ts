  import { createClient as _createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // ─── helpers ─────────────────────────────────────────────────────────────────

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  function errorResponse(message: string, status = 500): Response {
    return jsonResponse({ error: message }, status);
  }

  async function getAmadeusToken(
    apiKey: string,
    apiSecret: string,
  ): Promise<string> {
    const res = await fetch(
      "https://test.api.amadeus.com/v1/security/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${apiSecret}`,
      },
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        `Amadeus auth failed [${res.status}]: ${JSON.stringify(data)}`,
      );
    }
    return data.access_token as string;
  }

  async function amadeusGet(
    url: string,
    token: string,
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
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
      const AMADEUS_API_KEY = Deno.env.get("AMADEUS_API_KEY");
      const AMADEUS_API_SECRET = Deno.env.get("AMADEUS_API_SECRET");

      if (!AMADEUS_API_KEY) {
        return errorResponse("AMADEUS_API_KEY is not configured", 500);
      }
      if (!AMADEUS_API_SECRET) {
        return errorResponse("AMADEUS_API_SECRET is not configured", 500);
      }

      // Parse body
      const body = await req.json().catch(() => null);
      if (!body || typeof body.action !== "string") {
        return errorResponse("Request body must include an 'action' field", 400);
      }

      const { action, ...params } = body;

      // Obtain OAuth token
      let accessToken: string;
      try {
        accessToken = await getAmadeusToken(AMADEUS_API_KEY, AMADEUS_API_SECRET);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Auth error";
        return errorResponse(`Amadeus authentication failed: ${msg}`, 502);
      }

      const baseUrl = "https://test.api.amadeus.com";
      let url: string;

      // ─── action router ────────────────────────────────────────────────────────

      switch (action) {
        // ── Flight offers ────────────────────────────────────────────────────
        case "flight-offers": {
          const {
            origin,
            destination,
            departureDate,
            adults = 1,
            max = 5,
            returnDate,
            travelClass,
            nonStop,
          } = params as {
            origin: string;
            destination: string;
            departureDate: string;
            adults?: number;
            max?: number;
            returnDate?: string;
            travelClass?: string;
            nonStop?: boolean;
          };

          if (!origin || !destination || !departureDate) {
            return errorResponse(
              "origin, destination and departureDate are required",
              400,
            );
          }

          url =
            `${baseUrl}/v2/shopping/flight-offers` +
            `?originLocationCode=${origin}` +
            `&destinationLocationCode=${destination}` +
            `&departureDate=${departureDate}` +
            `&adults=${adults}` +
            `&max=${max}` +
            `&currencyCode=INR`;

          if (returnDate) url += `&returnDate=${returnDate}`;
          if (travelClass) url += `&travelClass=${travelClass}`;
          if (nonStop !== undefined) url += `&nonStop=${nonStop}`;
          break;
        }

        // ── Hotel list by city ───────────────────────────────────────────────
        case "hotel-list": {
          const {
            cityCode,
            radius = 5,
            radiusUnit = "KM",
            ratings,
          } = params as {
            cityCode: string;
            radius?: number;
            radiusUnit?: string;
            ratings?: string;
          };

          if (!cityCode) return errorResponse("cityCode is required", 400);

          url =
            `${baseUrl}/v1/reference-data/locations/hotels/by-city` +
            `?cityCode=${cityCode}` +
            `&radius=${radius}` +
            `&radiusUnit=${radiusUnit}`;

          if (ratings) url += `&ratings=${ratings}`;
          break;
        }

        // ── Hotel offers (pricing) ────────────────────────────────────────────
        case "hotel-offers": {
          const {
            hotelIds,
            checkInDate,
            checkOutDate,
            adults = 1,
          } = params as {
            hotelIds: string;
            checkInDate: string;
            checkOutDate: string;
            adults?: number;
          };

          if (!hotelIds || !checkInDate || !checkOutDate) {
            return errorResponse(
              "hotelIds, checkInDate and checkOutDate are required",
              400,
            );
          }

          url =
            `${baseUrl}/v3/shopping/hotel-offers` +
            `?hotelIds=${hotelIds}` +
            `&checkInDate=${checkInDate}` +
            `&checkOutDate=${checkOutDate}` +
            `&adults=${adults}` +
            `&currency=INR`;
          break;
        }

        // ── City / Airport search ────────────────────────────────────────────
        case "city-search": {
          const { keyword, subType = "CITY,AIRPORT" } = params as {
            keyword: string;
            subType?: string;
          };

          if (!keyword) return errorResponse("keyword is required", 400);

          url =
            `${baseUrl}/v1/reference-data/locations` +
            `?subType=${subType}` +
            `&keyword=${encodeURIComponent(keyword)}` +
            `&page%5Blimit%5D=10`;
          break;
        }

        // ── Flight inspiration (cheap destinations) ───────────────────────────
        case "flight-inspirations": {
          const { origin, maxPrice, departureDate } = params as {
            origin: string;
            maxPrice?: number;
            departureDate?: string;
          };

          if (!origin) return errorResponse("origin is required", 400);

          url =
            `${baseUrl}/v1/shopping/flight-destinations` +
            `?origin=${origin}` +
            `&currencyCode=INR`;

          if (maxPrice) url += `&maxPrice=${maxPrice}`;
          if (departureDate) url += `&departureDate=${departureDate}`;
          break;
        }

        // ── Cheapest travel dates ─────────────────────────────────────────────
        case "flight-dates": {
          const { origin, destination } = params as {
            origin: string;
            destination: string;
          };

          if (!origin || !destination) {
            return errorResponse("origin and destination are required", 400);
          }

          url =
            `${baseUrl}/v1/shopping/flight-dates` +
            `?origin=${origin}` +
            `&destination=${destination}` +
            `&currencyCode=INR`;
          break;
        }

        // ── Nearest airport ───────────────────────────────────────────────────
        case "airport-nearest": {
          const { lat, lng } = params as { lat: number; lng: number };

          if (lat === undefined || lng === undefined) {
            return errorResponse("lat and lng are required", 400);
          }

          url =
            `${baseUrl}/v1/reference-data/locations/airports` +
            `?latitude=${lat}` +
            `&longitude=${lng}` +
            `&sort=distance` +
            `&page%5Blimit%5D=5`;
          break;
        }

        // ── Points of interest ────────────────────────────────────────────────
        case "poi-search": {
          const {
            lat,
            lng,
            radius = 1,
            categories,
          } = params as {
            lat: number;
            lng: number;
            radius?: number;
            categories?: string;
          };

          if (lat === undefined || lng === undefined) {
            return errorResponse("lat and lng are required", 400);
          }

          url =
            `${baseUrl}/v1/reference-data/locations/pois` +
            `?latitude=${lat}` +
            `&longitude=${lng}` +
            `&radius=${radius}` +
            `&page%5Blimit%5D=20`;

          if (categories) url += `&categories=${categories}`;
          break;
        }

        // ── Tours & activities ────────────────────────────────────────────────
        case "activities": {
          const {
            lat,
            lng,
            radius = 5,
          } = params as {
            lat: number;
            lng: number;
            radius?: number;
          };

          if (lat === undefined || lng === undefined) {
            return errorResponse("lat and lng are required", 400);
          }

          url =
            `${baseUrl}/v1/shopping/activities` +
            `?latitude=${lat}` +
            `&longitude=${lng}` +
            `&radius=${radius}`;
          break;
        }

        // ── Safety ratings ────────────────────────────────────────────────────
        case "safe-place": {
          const {
            lat,
            lng,
            radius = 1,
          } = params as {
            lat: number;
            lng: number;
            radius?: number;
          };

          if (lat === undefined || lng === undefined) {
            return errorResponse("lat and lng are required", 400);
          }

          url =
            `${baseUrl}/v1/safety/safety-rated-locations` +
            `?latitude=${lat}` +
            `&longitude=${lng}` +
            `&radius=${radius}` +
            `&page%5Blimit%5D=20`;
          break;
        }

        default:
          return errorResponse(
            `Unknown action: "${action}". Supported: flight-offers, hotel-list, hotel-offers, city-search, flight-inspirations, flight-dates, airport-nearest, poi-search, activities, safe-place`,
            400,
          );
      }

      // ── Execute request ───────────────────────────────────────────────────────
      const { ok, status, data } = await amadeusGet(url, accessToken);

      if (!ok) {
        console.error(`Amadeus API error [${status}]:`, JSON.stringify(data));
        return errorResponse(
          `Amadeus API error [${status}]: ${JSON.stringify(data)}`,
          status >= 500 ? 502 : status,
        );
      }

      return jsonResponse(data);
    } catch (error: unknown) {
      console.error("Amadeus function error:", error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return errorResponse(message, 500);
    }
  });
