// ─────────────────────────────────────────────────────────────────────────────
// useSeo — binds a component's metadata to the current route
// ─────────────────────────────────────────────────────────────────────────────
// Registers one layer in the head writer for as long as the component is
// mounted. Prefer the declarative <Seo> / <RouteSeo> components in
// src/components/Seo.tsx; reach for this hook directly only when the metadata
// depends on state that is awkward to thread through props.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import type { SeoOverrides } from "@/lib/seo";
import {
  createSeoLayerId,
  removeSeoLayer,
  setSeoLayer,
  SEO_PRIORITY,
} from "@/lib/seoHead";

const NO_OVERRIDES: SeoOverrides = {};

/**
 * Applies metadata for the current route, merged with any other mounted layer.
 *
 * @param overrides Fields that should win over the route registry's defaults.
 * @param priority  SEO_PRIORITY.page (default) or SEO_PRIORITY.route.
 */
export function useSeo(
  overrides: SeoOverrides = NO_OVERRIDES,
  priority: number = SEO_PRIORITY.page,
): void {
  const location = useLocation();

  // One id per component instance, stable across re-renders and StrictMode's
  // double effect invocation, so re-registering updates the layer in place.
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = createSeoLayerId();
  const id = idRef.current;

  // Callers pass an inline object literal, whose identity changes every render.
  // A serialised signature gives the effect a dependency that tracks the values
  // instead, and the ref hands the effect the live object without re-parsing.
  const signature = JSON.stringify(overrides ?? NO_OVERRIDES);
  const latest = useRef(overrides);
  latest.current = overrides;

  useEffect(() => {
    setSeoLayer(id, priority, location.pathname, latest.current);
    return () => removeSeoLayer(id);
  }, [id, priority, location.pathname, signature]);
}
