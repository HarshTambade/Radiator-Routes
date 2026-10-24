import { featuredDestinations } from "@/data/destinations";
import { nominatimSearch } from "@/services/nominatim";

export interface DestinationPhoto {
  url: string;
  sourceUrl: string;
  credit?: string;
  license?: string;
}

const photoCache = new Map<string, Promise<DestinationPhoto | null>>();
let geocodeQueue: Promise<void> = Promise.resolve();
let lastGeocodeAt = 0;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Turn trip-planning prose into the actual destination while preserving place names. */
export function extractDestinationName(value: string): string {
  const input = value.trim().replace(/\s+/g, " ");
  if (!input) return "";

  const routeMatch = input.match(/\bfrom\s+.+?\s+to\s+(.+?)(?=\s+(?:and|with|while|where|we|i)\b|[,;.!?]|$)/i);
  const travelMatch = input.match(/\b(?:trip|travel|going|visiting)\s+to\s+(.+?)(?=\s+(?:and|with|while|where|we|i)\b|[,;.!?]|$)/i);
  const extracted = routeMatch?.[1] ?? travelMatch?.[1];
  const candidate = (extracted ?? input.split(",")[0] ?? input)
    .replace(/\b(?:for|with)\s+\d+\s+(?:people|persons|travelers|travellers|guests)\b.*$/i, "")
    .replace(/\s+(?:and\s+)?(?:we|i)\s+(?:are|am)\b.*$/i, "")
    .trim();

  return candidate || input;
}

function featuredImage(destination: string): string | null {
  const candidate = normalize(extractDestinationName(destination));
  const match = featuredDestinations.find((item) => {
    const name = normalize(item.name);
    return candidate === name || candidate === name.split(" ")[0];
  });
  return match?.image ?? null;
}

function localityBeforeLodging(destination: string): string | null {
  const lodging = /\s+(?:coco\s+villa|villa|resort|hotel|homestay|guest\s+house|cottage|hostel|camp)\b/i;
  const match = lodging.exec(destination);
  const locality = match ? destination.slice(0, match.index).trim() : "";
  return locality.length >= 3 && normalize(locality) !== normalize(destination) ? locality : null;
}

function plainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "").trim() || undefined;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body.textContent?.replace(/\s+/g, " ").trim() || undefined;
}

// Wikipedia's API now returns thumbnails on thumb.wikimedia.org; older
// responses used upload.wikimedia.org. Accepting only the old host discarded
// every photo, so trip cards fell back to the placeholder.
const WIKIMEDIA_IMAGE_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);

export function isWikimediaImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && WIKIMEDIA_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

async function findWikipediaPhoto(title: string): Promise<DestinationPhoto | null> {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "pageimages|pageprops",
    piprop: "thumbnail|name",
    pilicense: "free",
    pithumbsize: "1000",
    titles: title,
    origin: "*",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${query}`);
  if (!response.ok) return null;
  const data = await response.json();
  const page = (data?.query?.pages ?? []).find(
    (item: any) => !item.missing && !item.pageprops?.disambiguation && item.thumbnail?.source,
  );
  const imageUrl = page?.thumbnail?.source;
  if (!isWikimediaImageUrl(imageUrl)) return null;

  const fileTitle = typeof page.pageimage === "string" ? page.pageimage : "";
  if (fileTitle) {
    const commonsPhoto = await findCommonsPhoto(fileTitle).catch(() => null);
    if (commonsPhoto) return commonsPhoto;
  }

  return {
    url: imageUrl,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, "_"))}`,
  };
}

async function findCommonsPhoto(fileTitle: string): Promise<DestinationPhoto | null> {
  const fileQuery = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1000",
    titles: `File:${fileTitle}`,
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${fileQuery}`);
  if (!response.ok) return null;
  const data = await response.json();
  const info = data?.query?.pages?.[0]?.imageinfo?.[0];
  const url = info?.thumburl ?? info?.url;
  if (!isWikimediaImageUrl(url)) return null;
  return {
    url,
    sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle.replace(/ /g, "_"))}`,
    credit: plainText(info.extmetadata?.Artist?.value),
    license: plainText(info.extmetadata?.LicenseShortName?.value),
  };
}

function wikipediaTitle(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  let title = value.trim();
  const articlePath = title.match(/\/wiki\/([^?#]+)/i);
  if (articlePath) title = articlePath[1];
  title = title.replace(/^\w{2,3}:/, "");
  try {
    return decodeURIComponent(title).replace(/_/g, " ").trim() || null;
  } catch {
    return title.replace(/_/g, " ").trim() || null;
  }
}

const placePhotoCache = new Map<string, Promise<DestinationPhoto | null>>();

/** Find media for an exact attraction identity without falling back to a nearby, unrelated place. */
export function getExactPlacePhoto(place: {
  name: string;
  wikidata?: string | null;
  wikipedia?: string | null;
}): Promise<DestinationPhoto | null> {
  const title = wikipediaTitle(place.wikipedia);
  const wikidata = place.wikidata?.trim();
  const key = `${wikidata ?? ""}|${normalize(title ?? place.name)}`;
  const cached = placePhotoCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    if (wikidata && /^Q\d+$/.test(wikidata)) {
      try {
        const query = new URLSearchParams({
          action: "wbgetentities",
          ids: wikidata,
          props: "claims",
          format: "json",
          origin: "*",
        });
        const response = await fetch(`https://www.wikidata.org/w/api.php?${query}`);
        if (response.ok) {
          const data = await response.json();
          const filename = data?.entities?.[wikidata]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
          if (typeof filename === "string") {
            const photo = await findCommonsPhoto(filename).catch(() => null);
            if (photo) return photo;
          }
        }
      } catch {
        // Try the linked Wikipedia article or exact place name below.
      }
    }

    const titles = [title, place.name.trim()].filter((value, index, all): value is string =>
      Boolean(value) && all.indexOf(value) === index,
    );
    for (const candidate of titles) {
      const photo = await findWikipediaPhoto(candidate).catch(() => null);
      if (photo) return photo;
    }
    return null;
  })();

  placePhotoCache.set(key, request);
  return request;
}

async function geocodeDestination(destination: string) {
  const previous = geocodeQueue;
  let release: () => void = () => {};
  geocodeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const delay = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastGeocodeAt = Date.now();
    const results = await nominatimSearch(destination, 1);
    return results[0] ?? null;
  } finally {
    release();
  }
}

async function resolvePhoto(destination: string): Promise<DestinationPhoto | null> {
  const name = extractDestinationName(destination);
  const curated = featuredImage(name);
  if (curated) return { url: curated, sourceUrl: "" };

  const direct = await findWikipediaPhoto(name).catch(() => null);
  if (direct) return direct;

  const localityCandidate = localityBeforeLodging(name);
  if (localityCandidate) {
    const localityPhoto = await findWikipediaPhoto(localityCandidate).catch(() => null);
    if (localityPhoto) return localityPhoto;
  }

  // A trip entry may include a hotel or villa after the city name. Geocoding
  // resolves its locality; the image lookup then uses that exact locality page.
  const location = await geocodeDestination(name).catch(() => null);
  const address = location?.address ?? {};
  const locality = address.city || address.town || address.village || address.municipality || address.county;
  if (!locality || normalize(locality) === normalize(name)) return null;

  const localityPhoto = await findWikipediaPhoto(locality).catch(() => null);
  return localityPhoto;
}

export function getDestinationPhoto(destination: string): Promise<DestinationPhoto | null> {
  const key = normalize(extractDestinationName(destination));
  if (!key) return Promise.resolve(null);
  const cached = photoCache.get(key);
  if (cached) return cached;
  const request = resolvePhoto(destination).catch(() => null);
  photoCache.set(key, request);
  return request;
}
