// ─────────────────────────────────────────────────────────────────────────────
// Featured destinations — shown on the landing page and described to crawlers
// ─────────────────────────────────────────────────────────────────────────────
// Pulled out of Landing.tsx so that one array feeds both the rendered cards and
// the schema.org ItemList in the page's structured data. Google treats markup
// describing content a visitor cannot see as spam, so the only safe way to
// publish this data twice is to publish it from the same source.
//
// These are editorial highlights, not database records. There is no
// /destinations/:slug route yet, so the slugs are stable anchors and JSON-LD
// identifiers only — they are deliberately absent from sitemap.xml, which lists
// real, reachable URLs. If detail pages ever land, add a route to
// src/lib/seoRoutes.ts and the sitemap picks them up from there.
// ─────────────────────────────────────────────────────────────────────────────

import destinationGoa from "@/assets/destination-goa.jpg";
import destinationAgra from "@/assets/destination-agra.jpg";
import destinationKerala from "@/assets/destination-kerala.jpg";
import bangkok from "@/assets/bangkok.jpg";
import tokyo from "@/assets/tokyo.jpg";
import hanoi from "@/assets/hanoi.jpg";
import kualaLumpur from "@/assets/kuala-lumpur.jpg";
import sapa from "@/assets/sapa.jpg";
import malacca from "@/assets/malacca.jpg";

export interface Destination {
  /** Stable identifier. Not a URL — see the note at the top of this file. */
  slug: string;
  name: string;
  /** One line, used as the card copy and the TouristDestination description. */
  description: string;
  /** Bundled asset URL, root-relative once built. */
  image: string;
  /** ISO 3166-1 alpha-2, for schema.org PostalAddress. */
  country: string;
  /** Card badge. Matches the trip styles further down the landing page. */
  tag?: string;
}

/** Indian highlights, rendered as the large cards in the destinations section. */
export const destinations: readonly Destination[] = [
  {
    slug: "goa-beaches",
    name: "Goa Beaches",
    description: "Sun, sand and serenity on India's finest coastline",
    image: destinationGoa,
    country: "IN",
    tag: "Weekend Getaway",
  },
  {
    slug: "agra-heritage",
    name: "Agra Heritage",
    description: "Walk through centuries of Mughal grandeur",
    image: destinationAgra,
    country: "IN",
    tag: "Cultural Trip",
  },
  {
    slug: "kerala-backwaters",
    name: "Kerala Backwaters",
    description: "Cruise tranquil palm-fringed waterways",
    image: destinationKerala,
    country: "IN",
    tag: "Nature & Wellness",
  },
];

/**
 * Cities outside India, rendered as the smaller square tiles. The point they
 * make on the page is coverage: discovery, routing and currency follow you out
 * of the country because they are OpenStreetMap-based.
 */
export const beyondIndia: readonly Destination[] = [
  {
    slug: "bangkok",
    name: "Bangkok",
    description: "Temples, street food and river life in Thailand's capital",
    image: bangkok,
    country: "TH",
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    description: "Neon districts, quiet shrines and the world's best transit",
    image: tokyo,
    country: "JP",
  },
  {
    slug: "hanoi",
    name: "Hanoi",
    description: "Old Quarter lanes, lake mornings and Vietnamese coffee",
    image: hanoi,
    country: "VN",
  },
  {
    slug: "kuala-lumpur",
    name: "Kuala Lumpur",
    description: "Towers, night markets and rainforest on the city's edge",
    image: kualaLumpur,
    country: "MY",
  },
  {
    slug: "sapa",
    name: "Sapa",
    description: "Terraced valleys and hill-tribe villages in northern Vietnam",
    image: sapa,
    country: "VN",
  },
  {
    slug: "malacca",
    name: "Malacca",
    description: "A painted colonial port on the Strait, walkable end to end",
    image: malacca,
    country: "MY",
  },
];

/** Everything featured on the landing page, in the order it appears. */
export const featuredDestinations: readonly Destination[] = [
  ...destinations,
  ...beyondIndia,
];
