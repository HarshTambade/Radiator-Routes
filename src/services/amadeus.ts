// Amadeus API service
// Calls Amadeus Travel APIs directly from the browser — no Supabase edge function needed

const AMADEUS_API_KEY = import.meta.env.VITE_AMADEUS_API_KEY as string;
const AMADEUS_API_SECRET = import.meta.env.VITE_AMADEUS_API_SECRET as string;
const BASE_URL = "https://test.api.amadeus.com";

// ── OAuth token cache ────────────────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAmadeusToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  const res = await fetch(`${BASE_URL}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${AMADEUS_API_KEY}&client_secret=${AMADEUS_API_SECRET}`,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Amadeus auth failed [${res.status}]: ${JSON.stringify(data)}`,
    );
  }

  _cachedToken = data.access_token as string;
  // expires_in is in seconds; cache with a 60-second buffer
  _tokenExpiry = now + (Number(data.expires_in ?? 1799) - 60) * 1000;
  return _cachedToken;
}

async function amadeusGet(url: string): Promise<unknown> {
  const token = await getAmadeusToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Amadeus API error [${res.status}]: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

// ── Flight offers ────────────────────────────────────────────────────────────
export async function amadeusFlightOffers(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
  max?: number;
  returnDate?: string;
  travelClass?: string;
  nonStop?: boolean;
}): Promise<unknown> {
  const {
    origin,
    destination,
    departureDate,
    adults = 1,
    max = 5,
    returnDate,
    travelClass,
    nonStop,
  } = params;

  if (!origin || !destination || !departureDate) {
    throw new Error("origin, destination and departureDate are required");
  }

  let url =
    `${BASE_URL}/v2/shopping/flight-offers` +
    `?originLocationCode=${origin}` +
    `&destinationLocationCode=${destination}` +
    `&departureDate=${departureDate}` +
    `&adults=${adults}` +
    `&max=${max}` +
    `&currencyCode=INR`;

  if (returnDate) url += `&returnDate=${returnDate}`;
  if (travelClass) url += `&travelClass=${travelClass}`;
  if (nonStop !== undefined) url += `&nonStop=${nonStop}`;

  return amadeusGet(url);
}

// ── Hotel list by city ───────────────────────────────────────────────────────
export async function amadeusHotelList(params: {
  cityCode: string;
  radius?: number;
  radiusUnit?: string;
  ratings?: string;
}): Promise<unknown> {
  const { cityCode, radius = 5, radiusUnit = "KM", ratings } = params;

  if (!cityCode) throw new Error("cityCode is required");

  let url =
    `${BASE_URL}/v1/reference-data/locations/hotels/by-city` +
    `?cityCode=${cityCode}` +
    `&radius=${radius}` +
    `&radiusUnit=${radiusUnit}`;

  if (ratings) url += `&ratings=${ratings}`;

  return amadeusGet(url);
}

// ── Hotel offers (pricing) ───────────────────────────────────────────────────
export async function amadeusHotelOffers(params: {
  hotelIds: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
}): Promise<unknown> {
  const { hotelIds, checkInDate, checkOutDate, adults = 1 } = params;

  if (!hotelIds || !checkInDate || !checkOutDate) {
    throw new Error("hotelIds, checkInDate and checkOutDate are required");
  }

  const url =
    `${BASE_URL}/v3/shopping/hotel-offers` +
    `?hotelIds=${hotelIds}` +
    `&checkInDate=${checkInDate}` +
    `&checkOutDate=${checkOutDate}` +
    `&adults=${adults}` +
    `&currency=INR`;

  return amadeusGet(url);
}

// ── City / Airport search ────────────────────────────────────────────────────
export async function amadeusCitySearch(params: {
  keyword: string;
  subType?: string;
}): Promise<unknown> {
  const { keyword, subType = "CITY,AIRPORT" } = params;

  if (!keyword) throw new Error("keyword is required");

  const url =
    `${BASE_URL}/v1/reference-data/locations` +
    `?subType=${subType}` +
    `&keyword=${encodeURIComponent(keyword)}` +
    `&page%5Blimit%5D=10`;

  return amadeusGet(url);
}

// ── Flight inspiration (cheap destinations) ──────────────────────────────────
export async function amadeusFlightInspirations(params: {
  origin: string;
  maxPrice?: number;
  departureDate?: string;
}): Promise<unknown> {
  const { origin, maxPrice, departureDate } = params;

  if (!origin) throw new Error("origin is required");

  let url =
    `${BASE_URL}/v1/shopping/flight-destinations` +
    `?origin=${origin}` +
    `&currencyCode=INR`;

  if (maxPrice) url += `&maxPrice=${maxPrice}`;
  if (departureDate) url += `&departureDate=${departureDate}`;

  return amadeusGet(url);
}

// ── Cheapest travel dates ────────────────────────────────────────────────────
export async function amadeusFlightDates(params: {
  origin: string;
  destination: string;
}): Promise<unknown> {
  const { origin, destination } = params;

  if (!origin || !destination) {
    throw new Error("origin and destination are required");
  }

  const url =
    `${BASE_URL}/v1/shopping/flight-dates` +
    `?origin=${origin}` +
    `&destination=${destination}` +
    `&currencyCode=INR`;

  return amadeusGet(url);
}

// ── Nearest airport ──────────────────────────────────────────────────────────
export async function amadeusAirportNearest(params: {
  lat: number;
  lng: number;
}): Promise<unknown> {
  const { lat, lng } = params;

  if (lat === undefined || lng === undefined) {
    throw new Error("lat and lng are required");
  }

  const url =
    `${BASE_URL}/v1/reference-data/locations/airports` +
    `?latitude=${lat}` +
    `&longitude=${lng}` +
    `&sort=distance` +
    `&page%5Blimit%5D=5`;

  return amadeusGet(url);
}

// ── Points of interest ───────────────────────────────────────────────────────
export async function amadeusPoiSearch(params: {
  lat: number;
  lng: number;
  radius?: number;
  categories?: string;
}): Promise<unknown> {
  const { lat, lng, radius = 1, categories } = params;

  if (lat === undefined || lng === undefined) {
    throw new Error("lat and lng are required");
  }

  let url =
    `${BASE_URL}/v1/reference-data/locations/pois` +
    `?latitude=${lat}` +
    `&longitude=${lng}` +
    `&radius=${radius}` +
    `&page%5Blimit%5D=20`;

  if (categories) url += `&categories=${categories}`;

  return amadeusGet(url);
}

// ── Tours & activities ───────────────────────────────────────────────────────
export async function amadeusActivities(params: {
  lat: number;
  lng: number;
  radius?: number;
}): Promise<unknown> {
  const { lat, lng, radius = 5 } = params;

  if (lat === undefined || lng === undefined) {
    throw new Error("lat and lng are required");
  }

  const url =
    `${BASE_URL}/v1/shopping/activities` +
    `?latitude=${lat}` +
    `&longitude=${lng}` +
    `&radius=${radius}`;

  return amadeusGet(url);
}

// ── Safety ratings ───────────────────────────────────────────────────────────
export async function amadeusSafePlace(params: {
  lat: number;
  lng: number;
  radius?: number;
}): Promise<unknown> {
  const { lat, lng, radius = 1 } = params;

  if (lat === undefined || lng === undefined) {
    throw new Error("lat and lng are required");
  }

  const url =
    `${BASE_URL}/v1/safety/safety-rated-locations` +
    `?latitude=${lat}` +
    `&longitude=${lng}` +
    `&radius=${radius}` +
    `&page%5Blimit%5D=20`;

  return amadeusGet(url);
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────
export async function amadeus(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "flight-offers":
      return amadeusFlightOffers(params as Parameters<typeof amadeusFlightOffers>[0]);

    case "hotel-list":
      return amadeusHotelList(params as Parameters<typeof amadeusHotelList>[0]);

    case "hotel-offers":
      return amadeusHotelOffers(params as Parameters<typeof amadeusHotelOffers>[0]);

    case "city-search":
      return amadeusCitySearch(params as Parameters<typeof amadeusCitySearch>[0]);

    case "flight-inspirations":
      return amadeusFlightInspirations(
        params as Parameters<typeof amadeusFlightInspirations>[0],
      );

    case "flight-dates":
      return amadeusFlightDates(params as Parameters<typeof amadeusFlightDates>[0]);

    case "airport-nearest":
      return amadeusAirportNearest(
        params as Parameters<typeof amadeusAirportNearest>[0],
      );

    case "poi-search":
      return amadeusPoiSearch(params as Parameters<typeof amadeusPoiSearch>[0]);

    case "activities":
      return amadeusActivities(params as Parameters<typeof amadeusActivities>[0]);

    case "safe-place":
      return amadeusSafePlace(params as Parameters<typeof amadeusSafePlace>[0]);

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: flight-offers, hotel-list, hotel-offers, ` +
          `city-search, flight-inspirations, flight-dates, airport-nearest, poi-search, ` +
          `activities, safe-place`,
      );
  }
}
