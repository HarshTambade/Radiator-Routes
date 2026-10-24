// OpenTripMap access is proxied by Supabase so its provider key is never
// embedded in the browser bundle.

import { supabase } from "@/integrations/supabase/client";

export interface OTMPlace {
  xid: string;
  name: string;
  dist?: number;
  rate?: number;
  osm?: string;
  kinds?: string;
  point?: { lon: number; lat: number };
}

export interface OTMPlaceDetail {
  xid: string;
  name: string;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    road?: string;
    house_number?: string;
    country_code?: string;
  };
  rate?: number;
  osm?: string;
  kinds?: string;
  otm?: string;
  wikipedia?: string;
  image?: string;
  preview?: { source?: string; height?: number; width?: number };
  wikipedia_extracts?: { title?: string; text?: string; html?: string };
  point?: { lon: number; lat: number };
  bbox?: { lon_min: number; lat_min: number; lon_max: number; lat_max: number };
  url?: string;
  wikidata?: string;
  info?: { descr?: string; image?: string; src?: string };
}

async function invokeOpenTripMap<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("opentripmap", {
    body: { action, ...params },
  });
  if (error) {
    const fallback = error.message || "OpenTripMap request failed.";
    const response = error.context;
    if (response instanceof Response) {
      let providerMessage: string | undefined;
      try {
        providerMessage = (await response.clone().json() as { error?: string }).error;
      } catch {
        // The edge gateway may return a non-JSON error page.
      }
      throw new Error(providerMessage || `${fallback} (HTTP ${response.status})`);
    }
    throw new Error(fallback);
  }
  if (data === null || data === undefined) throw new Error("OpenTripMap returned an empty response.");
  return data as T;
}

/** True when the app can reach the authenticated server proxy. */
export function isOpenTripMapConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  ));
}

export function otmRadius(params: {
  lat: number;
  lon: number;
  radius?: number;
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  return invokeOpenTripMap("radius", params);
}

export function otmDetails(xid: string): Promise<OTMPlaceDetail> {
  const id = xid?.trim();
  if (!id) throw new Error("xid is required for details");
  return invokeOpenTripMap("details", { xid: id });
}

export function otmAutosuggest(params: {
  name: string;
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
  kinds?: string;
}): Promise<OTMPlace[]> {
  if (!params.name?.trim()) throw new Error("name is required for autosuggest");
  return invokeOpenTripMap("autosuggest", params);
}

export function otmBbox(params: {
  bbox: { lon_min: number; lat_min: number; lon_max: number; lat_max: number };
  kinds?: string;
  limit?: number;
  rate?: number;
  format?: string;
}): Promise<OTMPlace[]> {
  if (!params.bbox) throw new Error("bbox is required");
  return invokeOpenTripMap("bbox", params);
}

export async function opentripmap(body: {
  action: "radius" | "details" | "autosuggest" | "bbox";
  [key: string]: unknown;
}): Promise<OTMPlace[] | OTMPlaceDetail> {
  const { action, ...params } = body;
  return invokeOpenTripMap(action, params);
}
