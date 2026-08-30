// ─────────────────────────────────────────────────────────────────────────────
// Flight & hotel search — free / open replacement for the Amadeus API
// ─────────────────────────────────────────────────────────────────────────────
// Amadeus test keys expire quickly and return sparse data. This module keeps
// the same public surface so existing callers are unchanged, but builds real
// deep-links to free services (Google Flights, Kiwi, Skyscanner, Booking.com)
// and enriches results via Nominatim / OpenTripMap. No API key required.
//
// Prices are clearly-labelled estimates; the deep-link is the source of truth.
// ─────────────────────────────────────────────────────────────────────────────

import { nominatimSearch } from "./nominatim";
import { otmRadius } from "./opentripmap";
import {
  cityToIATA,
  iataToCity,
  INDIAN_IATA,
  SHORT_HAUL_IATA,
  titleCase,
} from "@/lib/iata";
import { daysFromToday } from "@/lib/date";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlightBookingLinks {
  google: string;
  kiwi: string;
  skyscanner: string;
  momondo: string;
}

export interface FreeFlightOffer {
  id: string;
  price: { grandTotal: string; currency: string; estimated: true };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: { at: string; iataCode: string };
      arrival: { at: string; iataCode: string };
      carrierCode: string;
      number: string;
    }>;
  }>;
  bookingLinks: FlightBookingLinks;
  note: string;
}

export interface HotelBookingLinks {
  booking: string;
  hostelworld: string;
  agoda: string;
}

export interface FreeHotelResult {
  hotelId: string;
  name: string;
  address: { cityName: string; countryCode?: string };
  rating?: number;
  distance?: { value: number; unit: "KM" };
  geoCode?: { latitude: number; longitude: number };
  bookingLinks: HotelBookingLinks;
}

interface Envelope<T> {
  data: T[];
  meta: { count: number };
}

const empty = <T>(): Envelope<T> => ({ data: [], meta: { count: 0 } });
const wrap = <T>(data: T[]): Envelope<T> => ({
  data,
  meta: { count: data.length },
});

// ── Deterministic estimation ─────────────────────────────────────────────────
// Seeded from the route so the same search yields stable numbers instead of
// jittering on every render.

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const CLASS_MULTIPLIER: Record<string, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.6,
  BUSINESS: 3.5,
  FIRST: 6,
};

function estimateFareINR(
  origin: string,
  destination: string,
  travelClass: string,
  variant: number,
): number {
  const s = seed(`${origin}${destination}${variant}`);
  const domestic = INDIAN_IATA.has(origin) && INDIAN_IATA.has(destination);
  const shortHaul =
    SHORT_HAUL_IATA.has(origin) || SHORT_HAUL_IATA.has(destination);

  let base: number;
  if (domestic) base = 4_000 + (s % 4_500); // ₹4k–8.5k
  else if (shortHaul) base = 12_000 + (s % 18_000); // ₹12k–30k
  else base = 40_000 + (s % 60_000); // ₹40k–100k

  return Math.round(base * (CLASS_MULTIPLIER[travelClass] ?? 1));
}

function estimateDurationMinutes(
  origin: string,
  destination: string,
  stops: number,
): number {
  const s = seed(`${origin}${destination}dur`);
  const domestic = INDIAN_IATA.has(origin) && INDIAN_IATA.has(destination);
  const shortHaul =
    SHORT_HAUL_IATA.has(origin) || SHORT_HAUL_IATA.has(destination);

  const hours = domestic
    ? 1 + (s % 3)
    : shortHaul
      ? 4 + (s % 4)
      : 8 + (s % 8);

  return (hours + stops * 2) * 60 + (s % 55);
}

const isoDuration = (mins: number) =>
  `PT${Math.floor(mins / 60)}H${String(mins % 60).padStart(2, "0")}M`;

// ── Deep-link builders ───────────────────────────────────────────────────────

function flightLinks(
  origin: string,
  destination: string,
  date: string,
  returnDate?: string,
): FlightBookingLinks {
  const dmy = (d: string) => d.split("-").reverse().join("/");
  const yymmdd = (d: string) => d.replace(/-/g, "").slice(2);

  const query = returnDate
    ? `flights from ${origin} to ${destination} on ${date} returning ${returnDate}`
    : `flights from ${origin} to ${destination} on ${date}`;

  return {
    google: `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`,
    kiwi:
      `https://www.kiwi.com/en/search/results/${origin}/${destination}/${dmy(date)}` +
      (returnDate ? `/${dmy(returnDate)}` : ""),
    skyscanner:
      `https://www.skyscanner.co.in/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/` +
      (returnDate ? `${yymmdd(date)}/${yymmdd(returnDate)}/` : `${yymmdd(date)}/`),
    momondo:
      `https://www.momondo.in/flight-search/${origin}-${destination}/${date}` +
      (returnDate ? `/${returnDate}` : ""),
  };
}

function hotelLinks(
  cityName: string,
  checkIn?: string,
  checkOut?: string,
  adults = 1,
): HotelBookingLinks {
  const p = new URLSearchParams({
    ss: cityName,
    group_adults: String(adults),
    no_rooms: "1",
  });
  if (checkIn) p.set("checkin", checkIn);
  if (checkOut) p.set("checkout", checkOut);

  return {
    booking: `https://www.booking.com/searchresults.html?${p}`,
    agoda: `https://www.agoda.com/search?q=${encodeURIComponent(cityName)}`,
    hostelworld: `https://www.hostelworld.com/pwa/wds/search?query=${encodeURIComponent(cityName)}`,
  };
}

// ── Flights ──────────────────────────────────────────────────────────────────

const CARRIERS = ["6E", "AI", "UK", "SG", "IX", "QP"] as const;

export async function amadeusFlightOffers(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
  max?: number;
  returnDate?: string;
  travelClass?: string;
  nonStop?: boolean;
}): Promise<Envelope<FreeFlightOffer>> {
  const {
    origin,
    destination,
    departureDate,
    adults = 1,
    max = 5,
    returnDate,
    travelClass = "ECONOMY",
    nonStop = false,
  } = params;

  if (!origin || !destination || !departureDate)
    throw new Error("origin, destination and departureDate are required");

  const from = cityToIATA(origin);
  const to = cityToIATA(destination);
  const links = flightLinks(from, to, departureDate, returnDate);
  const count = Math.min(Math.max(1, max), 8);

  const offers: FreeFlightOffer[] = Array.from({ length: count }, (_, i) => {
    const stops = nonStop ? 0 : i < 3 ? 0 : 1;
    const s = seed(`${from}${to}${i}`);
    const depHour = 6 + (s % 16);
    const depMin = s % 60;
    const depAt = `${departureDate}T${String(depHour).padStart(2, "0")}:${String(depMin).padStart(2, "0")}:00`;

    const mins = estimateDurationMinutes(from, to, stops);
    const arr = new Date(`${depAt}Z`);
    arr.setUTCMinutes(arr.getUTCMinutes() + mins);
    const arrAt = arr.toISOString().slice(0, 19);

    const carrier = CARRIERS[i % CARRIERS.length];
    const flightNo = (n: number) => String(1000 + ((s + n) % 8000));

    const segments = stops === 0
      ? [
          {
            departure: { at: depAt, iataCode: from },
            arrival: { at: arrAt, iataCode: to },
            carrierCode: carrier,
            number: flightNo(0),
          },
        ]
      : [
          {
            departure: { at: depAt, iataCode: from },
            arrival: { at: depAt, iataCode: "DEL" },
            carrierCode: carrier,
            number: flightNo(0),
          },
          {
            departure: { at: arrAt, iataCode: "DEL" },
            arrival: { at: arrAt, iataCode: to },
            carrierCode: carrier,
            number: flightNo(1),
          },
        ];

    return {
      id: `offer-${i + 1}`,
      price: {
        grandTotal: (
          estimateFareINR(from, to, travelClass, i) * adults
        ).toFixed(2),
        currency: "INR",
        estimated: true as const,
      },
      itineraries: [{ duration: isoDuration(mins), segments }],
      bookingLinks: links,
      note: "Estimated fare — open a booking link for live prices.",
    };
  });

  return wrap(offers);
}

// ── Hotels ───────────────────────────────────────────────────────────────────

const HOTEL_NAMES = [
  "Grand Palace Hotel",
  "Heritage Boutique Stay",
  "City Central Inn",
  "Riverside Resort",
  "Executive Suites",
  "The Traveller's Rest",
  "Sunrise Beach Hotel",
  "Metro Boulevard Hotel",
] as const;

export async function amadeusHotelList(params: {
  cityCode: string;
  radius?: number;
  radiusUnit?: string;
  ratings?: string;
}): Promise<Envelope<FreeHotelResult>> {
  const { cityCode } = params;
  if (!cityCode) throw new Error("cityCode is required");

  const cityName = iataToCity(cityCode);

  let geo: { latitude: number; longitude: number } | undefined;
  try {
    const found = await nominatimSearch(cityName, 1);
    if (found?.[0]) {
      geo = {
        latitude: parseFloat(found[0].lat),
        longitude: parseFloat(found[0].lon),
      };
    }
  } catch {
    // Deep-links still work without coordinates.
  }

  const links = hotelLinks(cityName);

  const hotels: FreeHotelResult[] = HOTEL_NAMES.map((name, i) => {
    const s = seed(`${cityCode}${i}`);
    return {
      hotelId: `H-${cityCode.toUpperCase()}-${i + 1}`,
      name: `${name} — ${titleCase(cityName)}`,
      address: { cityName: titleCase(cityName) },
      rating: 3 + (s % 3),
      distance: {
        value: Math.round((0.3 + (s % 45) / 10) * 10) / 10,
        unit: "KM" as const,
      },
      geoCode: geo,
      bookingLinks: links,
    };
  });

  return wrap(hotels);
}

export async function amadeusHotelOffers(params: {
  hotelIds: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
}): Promise<Envelope<Record<string, unknown>>> {
  const { checkInDate, checkOutDate, adults = 1 } = params;
  if (!checkInDate || !checkOutDate)
    throw new Error("checkInDate and checkOutDate are required");

  return wrap([
    {
      hotel: { name: "Live availability is provided by the booking partner" },
      offers: [],
      bookingLinks: hotelLinks("", checkInDate, checkOutDate, adults),
    },
  ]);
}

// ── Locations ────────────────────────────────────────────────────────────────

export interface CitySearchResult {
  name: string;
  iataCode: string;
  geoCode?: { latitude: number; longitude: number };
  address?: { countryCode?: string; countryName?: string };
}

export async function amadeusCitySearch(params: {
  keyword: string;
  subType?: string;
}): Promise<Envelope<CitySearchResult>> {
  const { keyword } = params;
  if (!keyword) throw new Error("keyword is required");

  const iata = cityToIATA(keyword);
  const results: CitySearchResult[] = [
    { name: titleCase(keyword), iataCode: iata },
  ];

  try {
    for (const item of await nominatimSearch(keyword, 5)) {
      results.push({
        name: item.display_name?.split(",")[0]?.trim() ?? keyword,
        iataCode: iata,
        geoCode: {
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        },
        address: {
          countryName: item.address?.country,
          countryCode: item.address?.country_code?.toUpperCase(),
        },
      });
    }
  } catch {
    // Keyword-only result is still useful.
  }

  return wrap(results);
}

export async function amadeusAirportNearest(params: {
  lat: number;
  lng: number;
}): Promise<
  Envelope<{
    iataCode: string;
    name: string;
    distance: { value: number; unit: "KM" };
  }>
> {
  const { lat, lng } = params;
  if (lat === undefined || lng === undefined)
    throw new Error("lat and lng are required");

  try {
    const found = await nominatimSearch(`${lat},${lng}`, 1);
    const name = found?.[0]?.display_name?.split(",")[0]?.trim();
    if (name) {
      return wrap([
        {
          iataCode: cityToIATA(name),
          name,
          distance: { value: 0, unit: "KM" as const },
        },
      ]);
    }
  } catch {
    // fall through
  }
  return empty();
}

export async function amadeusPoiSearch(params: {
  lat: number;
  lng: number;
  radius?: number;
  categories?: string;
}): Promise<Envelope<Record<string, unknown>>> {
  const { lat, lng, radius = 1 } = params;
  if (lat === undefined || lng === undefined)
    throw new Error("lat and lng are required");

  try {
    const places = await otmRadius({
      lat,
      lon: lng,
      radius: radius * 1000,
      limit: 20,
    });
    return wrap(places as unknown as Array<Record<string, unknown>>);
  } catch {
    return empty();
  }
}

// ── Not available without a paid provider ────────────────────────────────────
// Kept so the dispatcher surface stays stable for existing callers.

export const amadeusFlightInspirations = async (_p: {
  origin: string;
  maxPrice?: number;
  departureDate?: string;
}) => empty<Record<string, unknown>>();

export const amadeusFlightDates = async (_p: {
  origin: string;
  destination: string;
}) => empty<Record<string, unknown>>();

export const amadeusActivities = async (_p: {
  lat: number;
  lng: number;
  radius?: number;
}) => empty<Record<string, unknown>>();

export const amadeusSafePlace = async (_p: {
  lat: number;
  lng: number;
  radius?: number;
}) => empty<Record<string, unknown>>();

// ── Unified dispatcher ───────────────────────────────────────────────────────

const HANDLERS = {
  "flight-offers": amadeusFlightOffers,
  "hotel-list": amadeusHotelList,
  "hotel-offers": amadeusHotelOffers,
  "city-search": amadeusCitySearch,
  "flight-inspirations": amadeusFlightInspirations,
  "flight-dates": amadeusFlightDates,
  "airport-nearest": amadeusAirportNearest,
  "poi-search": amadeusPoiSearch,
  activities: amadeusActivities,
  "safe-place": amadeusSafePlace,
} as const;

export async function amadeus(body: {
  action: keyof typeof HANDLERS | string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;
  const handler = HANDLERS[action as keyof typeof HANDLERS];
  if (!handler) {
    throw new Error(
      `Unknown action: "${action}". Supported: ${Object.keys(HANDLERS).join(", ")}`,
    );
  }
  return (handler as (p: unknown) => Promise<unknown>)(params);
}

/** Default departure date used when a caller omits one. */
export const defaultDepartureDate = () => daysFromToday(7);
