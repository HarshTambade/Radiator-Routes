// OpenRouteService requests go through the authenticated Edge Function so the
// provider credential stays server-side and request quotas can be enforced.

import { supabase } from "@/integrations/supabase/client";

type Coord = [number, number]; // [longitude, latitude]
interface WaypointParam { lat: number; lon: number }

async function invokeOpenRoute(action: string, params: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("openroute", {
    body: { action, ...params },
  });
  if (error) {
    const fallback = error.message || "OpenRouteService request failed.";
    const response = error.context;
    if (response instanceof Response) {
      let providerMessage: string | undefined;
      try {
        providerMessage = (await response.clone().json() as { error?: string }).error;
      } catch {
        // The edge gateway can return a non-JSON error page.
      }
      throw new Error(providerMessage || `${fallback} (HTTP ${response.status})`);
    }
    throw new Error(fallback);
  }
  if (data === null || data === undefined) throw new Error("OpenRouteService returned an empty response.");
  return data;
}

export function orsDirections(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  alternatives?: boolean;
  waypoints?: WaypointParam[];
  elevation?: boolean;
}): Promise<unknown> {
  return invokeOpenRoute("directions", params);
}

export function orsDirectionsGeoJson(params: {
  origin: WaypointParam;
  destination: WaypointParam;
  profile?: string;
  waypoints?: WaypointParam[];
}): Promise<unknown> {
  return invokeOpenRoute("directions-geojson", params);
}

export function orsIsochrone(params: {
  lat: number;
  lon: number;
  range?: number[];
  range_type?: string;
  profile?: string;
  interval?: number;
  smoothing?: number;
}): Promise<unknown> {
  return invokeOpenRoute("isochrone", params);
}

export function orsMatrix(params: {
  locations: Coord[];
  sources?: number[];
  destinations?: number[];
  profile?: string;
  metrics?: string[];
}): Promise<unknown> {
  if (!Array.isArray(params.locations) || params.locations.length < 2) {
    throw new Error("locations must be an array of at least 2 [longitude, latitude] pairs");
  }
  return invokeOpenRoute("matrix", params);
}

export function orsOptimization(params: {
  shipments: unknown[];
  vehicles: unknown[];
}): Promise<unknown> {
  return invokeOpenRoute("optimization", params);
}

export function orsGeocode(params: {
  query: string;
  size?: number;
  countryCode?: string;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  if (!params.query?.trim()) throw new Error("query is required for geocoding");
  return invokeOpenRoute("geocode", params);
}

export function orsGeocodeStructured(params: {
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}): Promise<unknown> {
  return invokeOpenRoute("geocode-structured", params);
}

export function orsReverseGeocode(params: {
  lat: number;
  lon: number;
  size?: number;
}): Promise<unknown> {
  return invokeOpenRoute("reverse-geocode", params);
}

export function orsAutocomplete(params: {
  query: string;
  focusLat?: number;
  focusLon?: number;
}): Promise<unknown> {
  if (!params.query?.trim()) throw new Error("query is required for autocomplete");
  return invokeOpenRoute("autocomplete", params);
}

export function orsElevationPoint(params: { lat: number; lon: number }): Promise<unknown> {
  return invokeOpenRoute("elevation-point", params);
}

export function orsElevationLine(params: { coordinates: unknown }): Promise<unknown> {
  return invokeOpenRoute("elevation-line", params);
}

export async function openroute(body: { action: string; [key: string]: unknown }): Promise<unknown> {
  const { action, ...params } = body;
  return invokeOpenRoute(action, params);
}
