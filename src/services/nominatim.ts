// Compatibility adapter for older call sites. Geocoding uses the authenticated
// OpenRouteService Pelias proxy so browser clients do not hit the public
// Nominatim endpoint directly or bypass provider quotas.

import { orsGeocode, orsReverseGeocode } from "@/services/openroute";

export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
  boundingbox?: string[];
}

type PeliasFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function featureList(response: unknown): PeliasFeature[] {
  if (!response || typeof response !== "object") return [];
  const features = (response as { features?: unknown }).features;
  return Array.isArray(features)
    ? features.filter((feature): feature is PeliasFeature => Boolean(feature) && typeof feature === "object")
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toNominatimResult(feature: PeliasFeature): NominatimResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2
    || typeof coordinates[0] !== "number" || !Number.isFinite(coordinates[0])
    || typeof coordinates[1] !== "number" || !Number.isFinite(coordinates[1])) return null;

  const properties = feature.properties ?? {};
  const label = stringValue(properties.label) ?? stringValue(properties.name)
    ?? `${coordinates[1]}, ${coordinates[0]}`;
  const address: Record<string, string> = {};
  const mappedAddress: Record<string, unknown> = {
    house_number: properties.housenumber,
    road: properties.street,
    neighbourhood: properties.neighbourhood,
    suburb: properties.neighbourhood,
    city: properties.locality ?? properties.localadmin,
    county: properties.county,
    state: properties.region,
    postcode: properties.postalcode,
    country: properties.country,
    country_code: properties.country_a,
  };
  for (const [key, value] of Object.entries(mappedAddress)) {
    const text = stringValue(value);
    if (text) address[key] = key === "country_code" ? text.toLowerCase() : text;
  }

  const gid = stringValue(properties.gid) ?? "";
  const osmMatch = gid.match(/(?:^|:)(node|way|relation)\/(\d+)(?:$|:)/i);
  const osmType = osmMatch?.[1]?.toLowerCase() ?? "unknown";
  const osmId = osmMatch ? Number(osmMatch[2]) : 0;
  return {
    // These fields are retained for the old result shape. They are zero when
    // Pelias does not return a source OSM object identifier.
    place_id: Number.isSafeInteger(osmId) ? osmId : 0,
    licence: "© OpenStreetMap contributors",
    osm_type: osmType,
    osm_id: Number.isSafeInteger(osmId) ? osmId : 0,
    lat: String(coordinates[1]),
    lon: String(coordinates[0]),
    display_name: label,
    ...(Object.keys(address).length ? { address } : {}),
  };
}

/** Forward geocoding: free text to coordinates through the authenticated proxy. */
export async function nominatimSearch(query: string, limit = 5): Promise<NominatimResult[]> {
  const normalized = query?.trim();
  if (!normalized) throw new Error("query is required for search");
  if (normalized.length > 200) throw new Error("query must be 200 characters or fewer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("limit must be from 1 to 10");

  const response = await orsGeocode({ query: normalized, size: limit });
  return featureList(response).map(toNominatimResult).filter((item): item is NominatimResult => item !== null);
}

/** Reverse geocoding: coordinates to address through the authenticated proxy. */
export async function nominatimReverse(lat: number, lon: number): Promise<NominatimResult> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error("lat must be in [-90, 90] and lon must be in [-180, 180]");
  }
  const result = featureList(await orsReverseGeocode({ lat, lon, size: 1 }))
    .map(toNominatimResult)
    .find((item): item is NominatimResult => item !== null);
  if (!result) throw new Error("No address was found for these coordinates.");
  return result;
}

/** Nominatim's OSM-ID lookup is not exposed by the Pelias proxy. */
export async function nominatimLookup(osm_ids: string): Promise<NominatimResult[]> {
  if (!osm_ids?.trim()) throw new Error("osm_ids is required (e.g. 'N123,W456')");
  throw new Error("OSM object lookup is not available through the geocoding proxy.");
}

/** Unified action dispatcher kept for existing call sites. */
export async function nominatim(body: {
  action: "search" | "reverse" | "lookup";
  query?: string;
  limit?: number;
  lat?: number;
  lon?: number;
  osm_ids?: string;
}): Promise<NominatimResult | NominatimResult[]> {
  switch (body.action) {
    case "search":
      return nominatimSearch(body.query ?? "", body.limit);
    case "reverse":
      if (body.lat === undefined || body.lon === undefined) throw new Error("lat and lon are required for reverse geocoding");
      return nominatimReverse(body.lat, body.lon);
    case "lookup":
      return nominatimLookup(body.osm_ids ?? "");
    default:
      throw new Error(`Unknown action: "${body.action}". Supported: search, reverse, lookup`);
  }
}
