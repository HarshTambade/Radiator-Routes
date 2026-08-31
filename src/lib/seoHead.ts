// ─────────────────────────────────────────────────────────────────────────────
// <head> writer — the only module in the app that mutates document.head
// ─────────────────────────────────────────────────────────────────────────────
// Hand-rolled rather than pulled from react-helmet-async, for three reasons:
//
//   • React 18 is in use, so the native <title>/<meta> hoisting of React 19
//     isn't available, and Helmet would be a dependency for ~150 lines of DOM.
//   • index.html already ships a complete tag set. Helmet appends its own
//     copies, leaving two `og:title` tags in the document; this adopts the
//     existing tags and rewrites them in place instead.
//   • Pages are lazy-loaded behind one Suspense boundary, so metadata arrives
//     in two waves (route default, then page override). The layer model below
//     makes the outcome independent of which effect happens to fire first.
//
// Layering
// ────────
// Each mounted <Seo>/<RouteSeo> registers a layer. Layers merge by priority
// (route defaults 0, page overrides 10), so a page never has to restate what
// the route registry already knows, and React's effect ordering — children
// before parents — cannot let a stale default win.
// ─────────────────────────────────────────────────────────────────────────────

import {
  resolveSeo,
  type JsonLd,
  type ResolvedSeo,
  type SeoOverrides,
} from "./seo";

/**
 * Marks tags this module owns. Owned tags may be rewritten or removed on a
 * later route change; anything in index.html without this attribute is left
 * alone until the first apply adopts it.
 */
const MANAGED = "data-seo-managed";

export const SEO_PRIORITY = {
  /** Defaults derived from the matched route. */
  route: 0,
  /** A page component that knows more than the registry does. */
  page: 10,
} as const;

interface SeoLayer {
  id: number;
  priority: number;
  path: string;
  overrides: SeoOverrides;
}

const layers: SeoLayer[] = [];
let nextId = 1;

/** Allocates a stable id for one component instance. */
export function createSeoLayerId(): number {
  return nextId++;
}

/* ─── Tag construction ────────────────────────────────────────────────────── */

interface DesiredMeta {
  attr: "name" | "property";
  key: string;
  content: string;
}

/** og:image:type — scrapers reject a mismatch, so derive it from the URL. */
function imageMimeType(url: string): string | null {
  const extension = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

/**
 * The complete tag set for a page.
 *
 * Every core key is always present so that adopting a tag from index.html and
 * rewriting it is a total overwrite — a page can never inherit a leftover value
 * from the page before it. Keys that genuinely do not apply are omitted, and
 * `applySeo` removes any owned tag missing from this list.
 */
function buildMetaList(seo: ResolvedSeo): DesiredMeta[] {
  const tags: DesiredMeta[] = [
    { attr: "name", key: "description", content: seo.description },
    { attr: "name", key: "robots", content: seo.robots },
    // Googlebot reads `robots`, but an explicit directive removes any doubt
    // about which one wins on the private, auth-gated routes.
    { attr: "name", key: "googlebot", content: seo.robots },

    // ─── Open Graph — Facebook, LinkedIn, WhatsApp, Slack, iMessage ───
    { attr: "property", key: "og:type", content: seo.ogType },
    { attr: "property", key: "og:site_name", content: seo.siteName },
    { attr: "property", key: "og:locale", content: seo.locale },
    { attr: "property", key: "og:url", content: seo.canonical },
    { attr: "property", key: "og:title", content: seo.title },
    { attr: "property", key: "og:description", content: seo.description },
    { attr: "property", key: "og:image", content: seo.image },
    { attr: "property", key: "og:image:secure_url", content: seo.image },
    { attr: "property", key: "og:image:alt", content: seo.imageAlt },

    // ─── Twitter / X ───
    { attr: "name", key: "twitter:card", content: "summary_large_image" },
    { attr: "name", key: "twitter:site", content: seo.twitterHandle },
    { attr: "name", key: "twitter:creator", content: seo.twitterHandle },
    { attr: "name", key: "twitter:title", content: seo.title },
    { attr: "name", key: "twitter:description", content: seo.description },
    { attr: "name", key: "twitter:image", content: seo.image },
    { attr: "name", key: "twitter:image:alt", content: seo.imageAlt },
  ];

  if (seo.keywords) {
    tags.push({ attr: "name", key: "keywords", content: seo.keywords });
  }

  // Only assert dimensions that are known. resolveSeo zeroes them when a page
  // supplies its own image, and a wrong og:image:width is worse than none:
  // scrapers use it to lay out the card before the image has downloaded.
  if (seo.imageWidth > 0 && seo.imageHeight > 0) {
    tags.push(
      { attr: "property", key: "og:image:width", content: String(seo.imageWidth) },
      { attr: "property", key: "og:image:height", content: String(seo.imageHeight) },
    );
  }

  const mime = imageMimeType(seo.image);
  if (mime) {
    tags.push({ attr: "property", key: "og:image:type", content: mime });
  }

  return tags;
}

/* ─── DOM application ─────────────────────────────────────────────────────── */

function upsertMeta(head: HTMLHeadElement, tag: DesiredMeta): void {
  // Keys are module-level literals, never user input, so a literal selector is
  // safe here. Keep it that way if you add keys.
  let element = head.querySelector<HTMLMetaElement>(
    `meta[${tag.attr}="${tag.key}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(tag.attr, tag.key);
    head.appendChild(element);
  }

  // Adopt on first sight: from now on this module owns the tag, including the
  // right to remove it when a later page has no value for it.
  element.setAttribute(MANAGED, "");

  if (element.getAttribute("content") !== tag.content) {
    element.setAttribute("content", tag.content);
  }
}

function pruneOrphans(head: HTMLHeadElement, desired: DesiredMeta[]): void {
  const wanted = new Set(desired.map((tag) => `${tag.attr}=${tag.key}`));

  head.querySelectorAll<HTMLMetaElement>(`meta[${MANAGED}]`).forEach((element) => {
    const attr = element.hasAttribute("property") ? "property" : "name";
    const key = element.getAttribute(attr);
    if (key && !wanted.has(`${attr}=${key}`)) element.remove();
  });
}

function upsertCanonical(head: HTMLHeadElement, href: string): void {
  let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    head.appendChild(link);
  }

  link.setAttribute(MANAGED, "");
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

/**
 * Replaces the JSON-LD blocks this module owns.
 *
 * The static SoftwareApplication, Organization and WebSite blocks in index.html
 * are untouched — they carry no MANAGED marker. Runtime blocks reference those
 * entities by @id (see SCHEMA_ID) rather than restating them, so nothing is
 * described twice.
 */
function applyJsonLd(head: HTMLHeadElement, blocks: JsonLd[]): void {
  head
    .querySelectorAll(`script[type="application/ld+json"][${MANAGED}]`)
    .forEach((element) => element.remove());

  for (const block of blocks) {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.setAttribute(MANAGED, "");
    // textContent, never innerHTML: JSON-LD can contain page-derived strings
    // such as a trip name, and textContent cannot introduce markup.
    script.textContent = JSON.stringify(block);
    head.appendChild(script);
  }
}

/** Writes a resolved metadata set into the document head. */
export function applySeo(seo: ResolvedSeo): void {
  if (typeof document === "undefined") return;

  const head = document.head;
  if (document.title !== seo.title) document.title = seo.title;

  const desired = buildMetaList(seo);
  // Upsert before pruning so the head is never briefly stripped of its tags.
  for (const tag of desired) upsertMeta(head, tag);
  pruneOrphans(head, desired);

  upsertCanonical(head, seo.canonical);
  applyJsonLd(head, seo.jsonLd);
}

/* ─── Layer registry ──────────────────────────────────────────────────────── */

function mergeOverrides(sorted: SeoLayer[]): SeoOverrides {
  const merged: Record<string, unknown> = {};
  const jsonLd: JsonLd[] = [];

  for (const layer of sorted) {
    for (const [key, value] of Object.entries(layer.overrides)) {
      // An explicit `undefined` means "no opinion", not "clear the default".
      if (value === undefined) continue;
      // JSON-LD accumulates: a page adds to the route's blocks, not over them.
      if (key === "jsonLd") {
        jsonLd.push(...(value as JsonLd[]));
        continue;
      }
      merged[key] = value;
    }
  }

  if (jsonLd.length) merged.jsonLd = jsonLd;
  return merged as SeoOverrides;
}

function flush(): void {
  if (layers.length === 0) return;

  const sorted = [...layers].sort(
    (a, b) => a.priority - b.priority || a.id - b.id,
  );
  // Every layer reads the same location; the highest-priority one is canonical.
  const path = sorted[sorted.length - 1].path;

  applySeo(resolveSeo(path, mergeOverrides(sorted)));
}

/** Registers or updates a layer, then rewrites the head. */
export function setSeoLayer(
  id: number,
  priority: number,
  path: string,
  overrides: SeoOverrides,
): void {
  const existing = layers.findIndex((layer) => layer.id === id);
  const layer: SeoLayer = { id, priority, path, overrides };

  if (existing === -1) layers.push(layer);
  else layers[existing] = layer;

  flush();
}

/** Removes a layer on unmount and reapplies whatever is left. */
export function removeSeoLayer(id: number): void {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) return;

  layers.splice(index, 1);
  flush();
}
