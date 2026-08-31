// ─────────────────────────────────────────────────────────────────────────────
// Route metadata registry — single source of truth for per-page SEO
// ─────────────────────────────────────────────────────────────────────────────
// Deliberately free of DOM access and `import.meta.env`, because three
// consumers that do not share a runtime import this module:
//
//   1. src/lib/seo.ts            — browser; resolves absolute URLs + JSON-LD
//   2. src/components/Seo.tsx    — browser; writes the tags into <head>
//   3. vite-plugins/sitemap.ts   — Node, at build time; emits sitemap.xml
//
// Keep this file pure data. Anything that needs an origin, `document` or an
// env var belongs in seo.ts instead, or the Vite build will fail to load it.
//
// Copy policy — same rule as the landing page (see Landing.tsx): a description
// here may only claim what `src/` actually implements. These strings are what
// search engines and social cards quote back at people, so they are the last
// place that should oversell.
// ─────────────────────────────────────────────────────────────────────────────

/** Sitemap change hint. Mirrors the sitemaps.org `<changefreq>` vocabulary. */
export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface BreadcrumbEntry {
  name: string;
  /** Root-relative path. */
  path: string;
}

export interface RouteSeo {
  /**
   * Route pattern exactly as registered in App.tsx. A `:param` segment matches
   * any single path segment, so `/itinerary/:tripId` matches `/itinerary/abc`
   * but not `/itinerary/abc/day/2`.
   */
  pattern: string;
  /** Title without the site-name suffix. `titleExact` opts out of the suffix. */
  title: string;
  titleExact?: boolean;
  description: string;
  keywords?: string[];
  /**
   * Indexable pages get `index, follow` and appear in sitemap.xml. Everything
   * behind the auth gate is false: ProtectedLayout redirects signed-out
   * visitors to /auth, so a crawler reaching /dashboard sees the sign-in page.
   * Indexing that URL would file a duplicate of /auth under the wrong address.
   */
  indexable: boolean;
  /** Sitemap hints. Only read for indexable routes. */
  changefreq?: ChangeFreq;
  priority?: number;
  /** Root-relative social image. Falls back to the site default when unset. */
  image?: string;
  imageAlt?: string;
  /** Trail shown to crawlers as BreadcrumbList. The route itself is appended. */
  breadcrumbs?: BreadcrumbEntry[];
  /** og:type for this page. Defaults to "website". */
  ogType?: "website" | "article" | "profile";
}

const HOME_CRUMB: BreadcrumbEntry = { name: "Home", path: "/" };

/**
 * Every route in App.tsx, in match order. `matchRouteSeo` walks this list top
 * to bottom and takes the first hit, so static patterns must precede the
 * parameterised ones that could also match them.
 */
export const ROUTE_SEO: readonly RouteSeo[] = [
  {
    pattern: "/",
    title: "Radiator Routes — AI Travel Planner for Group Trips in India",
    titleExact: true,
    description:
      "Plan group trips with an AI that shows its reasoning. Voice-first itineraries, 13 feasibility checks per plan, group fairness scoring, live location sharing, SOS with GPS, offline PWA — built entirely on free APIs.",
    keywords: [
      "AI travel planner India",
      "group trip planner",
      "itinerary generator",
      "voice travel planning",
      "group fairness scoring",
      "offline travel app",
      "PWA travel app",
      "SOS emergency travel",
      "accessible travel app",
      "free travel planner",
    ],
    indexable: true,
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    pattern: "/auth",
    title: "Sign in",
    description:
      "Sign in or create a Radiator Routes account to plan trips, invite friends and sync your itineraries across devices.",
    // A sign-in form has nothing to rank for, and indexing it competes with
    // the landing page for the brand query.
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/join/:inviteCode",
    title: "Join a trip",
    description:
      "You have been invited to join a trip on Radiator Routes. Sign in to send the organiser a join request.",
    // Invite links are private by design — they must never enter an index.
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/dashboard",
    title: "Dashboard",
    description:
      "Your trips at a glance — upcoming plans, group members, budgets and quick actions.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/itinerary",
    title: "Itineraries",
    description:
      "Day-by-day plans with verified timings and budgets, weather, maps, expense splitting and PDF export.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/itinerary/:tripId",
    title: "Trip itinerary",
    description:
      "Day-by-day plan with verified timings and budgets, weather, maps, expense splitting and PDF export.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB, { name: "Itineraries", path: "/itinerary" }],
  },
  {
    pattern: "/explore",
    title: "Explore places",
    description:
      "Search places, restaurants, flights and hotels using OpenTripMap, OpenStreetMap and Wikipedia, then add them straight to a trip.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/guide",
    title: "Travel guide",
    description:
      "AI-generated destination guides with suggested activities, timing and budget context.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/friends",
    title: "Friends",
    description:
      "Connect with travel companions, message them directly and send trip invites.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/community",
    title: "Community",
    description:
      "Travel communities with real-time chat and shared events for the places you are heading to.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
  {
    pattern: "/profile",
    title: "Profile",
    description:
      "Manage your account, pick a hosted or on-device AI engine, and set language and accessibility preferences.",
    indexable: false,
    breadcrumbs: [HOME_CRUMB],
  },
];

/** Metadata for any path that matches no route. */
export const NOT_FOUND_SEO: RouteSeo = {
  pattern: "*",
  title: "Page not found",
  description:
    "That page does not exist. Head back to the Radiator Routes home page to start planning a trip.",
  indexable: false,
  breadcrumbs: [HOME_CRUMB],
};

/** Escapes the regex metacharacters that can legally appear in a URL path. */
function escapeForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a route pattern into an anchored matcher.
 *
 * `:param` becomes a single-segment wildcard. A trailing slash is tolerated so
 * `/explore/` resolves to the same metadata as `/explore`.
 */
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith(":") ? "[^/]+" : escapeForRegex(segment),
    )
    .join("/");

  return new RegExp(source ? `^/${source}/?$` : "^/$");
}

// Patterns are fixed at module load, so compile each one once.
const COMPILED: readonly { matcher: RegExp; route: RouteSeo }[] = ROUTE_SEO.map(
  (route) => ({ matcher: patternToRegExp(route.pattern), route }),
);

/**
 * Resolves a pathname to its route metadata, falling back to the 404 entry.
 *
 * Accepts a full URL or a bare pathname; query strings and fragments are
 * ignored so `/explore?q=goa#top` still matches `/explore`.
 */
export function matchRouteSeo(pathname: string): RouteSeo {
  const path = pathname.split("?")[0].split("#")[0] || "/";
  return COMPILED.find(({ matcher }) => matcher.test(path))?.route ?? NOT_FOUND_SEO;
}

/** Routes that belong in sitemap.xml, in registry order. */
export function indexableRoutes(): RouteSeo[] {
  // A pattern with a parameter has no single canonical URL, so it can never be
  // a sitemap entry even if someone marks it indexable by mistake.
  return ROUTE_SEO.filter(
    (route) => route.indexable && !route.pattern.includes(":"),
  );
}

/**
 * Paths that robots.txt and the edge `X-Robots-Tag` rules should cover.
 * Parameterised patterns are reduced to their static prefix, which is what a
 * `Disallow:` line and a Vercel header `source` both want.
 */
export function disallowedPaths(): string[] {
  const paths = ROUTE_SEO.filter((route) => !route.indexable).map((route) => {
    const paramIndex = route.pattern.indexOf("/:");
    return paramIndex === -1
      ? route.pattern
      : `${route.pattern.slice(0, paramIndex)}/`;
  });

  return [...new Set(paths)];
}
