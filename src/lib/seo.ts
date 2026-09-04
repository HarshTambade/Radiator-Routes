// ─────────────────────────────────────────────────────────────────────────────
// SEO resolution — turns a pathname into a complete, absolute metadata set
// ─────────────────────────────────────────────────────────────────────────────
// This module owns everything the route registry (seoRoutes.ts) deliberately
// does not: the site origin, absolute URL construction, title composition and
// schema.org JSON-LD. `src/components/Seo.tsx` takes the object built here and
// writes it into <head>.
//
// What this can and cannot do
// ───────────────────────────
// Atlas AI is a client-rendered SPA, so the tags written at runtime are
// read by:
//   • the browser        — tab titles, the Android/iOS share sheet, PWA UI
//   • Googlebot          — it renders JavaScript before indexing
//
// They are NOT read by the link scrapers behind WhatsApp, Slack, iMessage,
// Facebook, LinkedIn or X. Those fetch the HTML once and never execute a
// script, so every one of them sees index.html. That is why index.html carries
// a complete, standalone set of Open Graph and Twitter tags rather than an
// empty shell: it is the real social preview for every URL on the domain.
// Per-route social previews would need server rendering or an edge function
// that injects tags before the response — see docs/BACKLOG.md.
// ─────────────────────────────────────────────────────────────────────────────

import {
  matchRouteSeo,
  type BreadcrumbEntry,
  type RouteSeo,
} from "./seoRoutes";

/** Loosely typed schema.org node. Serialised straight into a JSON-LD block. */
export type JsonLd = Record<string, unknown>;

/**
 * Deployed origin, used for canonical URLs, `og:url` and absolute image URLs.
 *
 * Set VITE_SITE_URL when deploying anywhere other than the default Vercel
 * domain, otherwise every canonical tag will point at the wrong host. The
 * fallback keeps preview builds and local development working without config.
 */
const FALLBACK_ORIGIN = "https://radiatorroutes.vercel.app";

function resolveOrigin(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  // Strip any trailing slash so joining a path never produces a double slash.
  return (configured || FALLBACK_ORIGIN).replace(/\/+$/, "");
}

export const SITE = {
  name: "Atlas AI",
  shortName: "RadRoutes",
  origin: resolveOrigin(),
  /** Appended to every page title except the landing page. */
  titleSeparator: " · ",
  /** og:locale. Fixed to the primary locale; the in-app language switcher
   *  changes UI strings, not the document's published locale. */
  locale: "en_IN",
  language: "en-IN",
  twitterHandle: "@RadiatorRoutes",
  themeColor: "#e8390e",
  /**
   * 1200×630 social card, generated from design/og-image.svg. A square app
   * icon here gets letterboxed or centre-cropped by every scraper, which is
   * what the previous 512×512 icon was doing.
   */
  image: "/og-image.png",
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt:
    "Atlas AI — speak your trip, code checks it. AI travel planner for group trips.",
  logo: "/icons/icon-512x512.png",
} as const;

/** Robots directives. Kept in one place so no page invents its own spelling. */
export const ROBOTS = {
  /** Indexable pages. The preview hints let Google show a large image card. */
  index:
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  /** Everything behind the auth gate, plus 404s and private invite links. */
  noindex: "noindex, nofollow, noarchive, noimageindex",
} as const;

/** True for absolute URLs and protocol-relative URLs, which need no origin. */
function isAbsolute(url: string): boolean {
  return /^(https?:)?\/\//i.test(url) || url.startsWith("data:");
}

/** Resolves a root-relative path to an absolute URL on the deployed origin. */
export function absoluteUrl(pathOrUrl: string): string {
  if (isAbsolute(pathOrUrl)) return pathOrUrl;
  return `${SITE.origin}/${pathOrUrl.replace(/^\/+/, "")}`;
}

/**
 * Canonical URL for a path: absolute, query and fragment stripped, no trailing
 * slash except at the root. Query strings on this app are UI state (search
 * terms, auth redirects), never distinct content, so they must not fork the
 * canonical URL.
 */
export function canonicalUrl(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  const trimmed = path.replace(/\/+$/, "");
  return trimmed ? absoluteUrl(trimmed) : `${SITE.origin}/`;
}

/** Composes the document title, appending the site name unless opted out. */
export function buildTitle(title: string, exact = false): string {
  if (exact) return title;
  if (!title) return SITE.name;
  return `${title}${SITE.titleSeparator}${SITE.name}`;
}

/** Per-page metadata a route may override. Every field is optional. */
export interface SeoOverrides {
  title?: string;
  titleExact?: boolean;
  description?: string;
  keywords?: string[];
  /** Root-relative or absolute. */
  image?: string;
  imageAlt?: string;
  /** Overrides the pathname used for canonical and og:url. */
  canonicalPath?: string;
  ogType?: "website" | "article" | "profile";
  /** Forces a directive. Defaults to the route registry's `indexable` flag. */
  robots?: string;
  /** Replaces the trail from the registry. The current page is appended. */
  breadcrumbs?: BreadcrumbEntry[];
  /** Appended after the automatic WebPage and BreadcrumbList blocks. */
  jsonLd?: JsonLd[];
  /** Skips the automatic WebPage/BreadcrumbList blocks entirely. */
  omitDefaultJsonLd?: boolean;
}

/** A complete metadata set. Every field is populated — see Seo.tsx for why. */
export interface ResolvedSeo {
  title: string;
  description: string;
  keywords: string;
  robots: string;
  canonical: string;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  ogType: string;
  locale: string;
  siteName: string;
  twitterHandle: string;
  jsonLd: JsonLd[];
}

/* ─── schema.org builders ─────────────────────────────────────────────────── */

/**
 * Stable @id fragments. Giving each entity an @id lets Google merge the blocks
 * emitted at runtime with the SoftwareApplication, Organization and WebSite
 * nodes hardcoded in index.html, instead of treating them as rival entities.
 */
export const SCHEMA_ID = {
  website: () => `${SITE.origin}/#website`,
  organization: () => `${SITE.origin}/#organization`,
  application: () => `${SITE.origin}/#application`,
  webPage: (url: string) => `${url}#webpage`,
  breadcrumb: (url: string) => `${url}#breadcrumb`,
} as const;

// The WebSite, Organization and SoftwareApplication entities are declared
// statically in index.html, so every crawler sees them whether or not it runs
// JavaScript. They are not re-emitted here — the blocks below reference them by
// @id instead, which is what lets Google treat the whole document as one graph.
//
// Consequence worth knowing: those static blocks hardcode the production
// origin. If you set VITE_SITE_URL to a different host, update the @id and url
// values in index.html to match, or you get two rival WebSite entities.

export function webPageJsonLd(resolved: ResolvedSeo, hasBreadcrumb: boolean): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": SCHEMA_ID.webPage(resolved.canonical),
    url: resolved.canonical,
    name: resolved.title,
    description: resolved.description,
    inLanguage: SITE.language,
    isPartOf: { "@id": SCHEMA_ID.website() },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: resolved.image,
      width: resolved.imageWidth,
      height: resolved.imageHeight,
    },
  };

  if (hasBreadcrumb) {
    node.breadcrumb = { "@id": SCHEMA_ID.breadcrumb(resolved.canonical) };
  }

  return node;
}

export function breadcrumbJsonLd(
  entries: readonly BreadcrumbEntry[],
  pageUrl: string,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": SCHEMA_ID.breadcrumb(pageUrl),
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

/**
 * ItemList of the destinations shown on the landing page.
 *
 * Only call this from a page that actually renders these destinations —
 * structured data describing content a visitor cannot see is a spam signal and
 * a Google policy violation, not a shortcut to extra keywords.
 */
export function destinationListJsonLd(
  items: readonly {
    name: string;
    description: string;
    image: string;
    country: string;
  }[],
  listName: string,
  pageUrl: string,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    mainEntityOfPage: { "@id": SCHEMA_ID.webPage(pageUrl) },
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "TouristDestination",
        name: item.name,
        description: item.description,
        image: absoluteUrl(item.image),
        address: { "@type": "PostalAddress", addressCountry: item.country },
      },
    })),
  };
}

/**
 * FAQPage for a set of questions that the page renders.
 *
 * Same rule as destinationListJsonLd, and Google is stricter about it here:
 * every question and its full answer must be visible on the page, and the page
 * must be about the FAQ content. Pass the same array the section renders.
 */
export function faqPageJsonLd(
  entries: readonly { question: string; answer: string }[],
  pageUrl: string,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntityOfPage: { "@id": SCHEMA_ID.webPage(pageUrl) },
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/* ─── Resolution ──────────────────────────────────────────────────────────── */

function robotsFor(route: RouteSeo, override?: string): string {
  if (override) return override;
  return route.indexable ? ROBOTS.index : ROBOTS.noindex;
}

/**
 * Merges route-registry defaults with page-level overrides into a complete
 * metadata set, and derives the automatic WebPage + BreadcrumbList blocks.
 */
export function resolveSeo(
  pathname: string,
  overrides: SeoOverrides = {},
): ResolvedSeo {
  const route = matchRouteSeo(pathname);
  const canonical = canonicalUrl(overrides.canonicalPath ?? pathname);
  const keywords = overrides.keywords ?? route.keywords ?? [];

  const resolved: ResolvedSeo = {
    title: buildTitle(
      overrides.title ?? route.title,
      overrides.titleExact ?? (overrides.title ? false : route.titleExact),
    ),
    description: overrides.description ?? route.description,
    keywords: keywords.join(", "),
    robots: robotsFor(route, overrides.robots),
    canonical,
    image: absoluteUrl(overrides.image ?? route.image ?? SITE.image),
    imageAlt: overrides.imageAlt ?? route.imageAlt ?? SITE.imageAlt,
    imageWidth: SITE.imageWidth,
    imageHeight: SITE.imageHeight,
    ogType: overrides.ogType ?? route.ogType ?? "website",
    locale: SITE.locale,
    siteName: SITE.name,
    twitterHandle: SITE.twitterHandle,
    jsonLd: [],
  };

  // A page-specific image is rarely 1200×630, so drop the dimension hints
  // rather than assert wrong ones — scrapers trust og:image:width literally.
  if (overrides.image) {
    resolved.imageWidth = 0;
    resolved.imageHeight = 0;
  }

  if (!overrides.omitDefaultJsonLd) {
    const trail = overrides.breadcrumbs ?? route.breadcrumbs;
    const hasBreadcrumb = Boolean(trail && trail.length > 0);

    resolved.jsonLd.push(webPageJsonLd(resolved, hasBreadcrumb));

    if (hasBreadcrumb) {
      const current: BreadcrumbEntry = {
        name: overrides.title ?? route.title,
        path: canonical,
      };
      resolved.jsonLd.push(breadcrumbJsonLd([...trail!, current], canonical));
    }
  }

  if (overrides.jsonLd?.length) {
    resolved.jsonLd.push(...overrides.jsonLd);
  }

  return resolved;
}
