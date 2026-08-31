// ─────────────────────────────────────────────────────────────────────────────
// Declarative metadata — <RouteSeo> for defaults, <Seo> for page overrides
// ─────────────────────────────────────────────────────────────────────────────
// Both render nothing; they write into document.head through the layer registry
// in src/lib/seoHead.ts.
//
// Placement matters. <RouteSeo> is mounted in App.tsx inside BrowserRouter but
// OUTSIDE the Suspense boundary, so the title, canonical URL and robots
// directive are correct the instant the URL changes — not after the route's
// lazy chunk has downloaded. <Seo> then refines that from inside a page once
// its own data has loaded, and wins because it registers at a higher priority.
// ─────────────────────────────────────────────────────────────────────────────

import { useSeo } from "@/hooks/useSeo";
import type { SeoOverrides } from "@/lib/seo";
import { SEO_PRIORITY } from "@/lib/seoHead";

/**
 * Route-level defaults, resolved from the registry in src/lib/seoRoutes.ts.
 * Mount exactly once, above the Suspense boundary.
 */
export function RouteSeo() {
  useSeo(undefined, SEO_PRIORITY.route);
  return null;
}

/**
 * Page-level metadata. Anything left out falls through to the route registry,
 * so a page only states what it actually knows better.
 *
 * ```tsx
 * <Seo title={`${trip.name} — ${trip.destination}`} description={summary} />
 * ```
 */
export function Seo(props: SeoOverrides) {
  useSeo(props, SEO_PRIORITY.page);
  return null;
}

export default Seo;
