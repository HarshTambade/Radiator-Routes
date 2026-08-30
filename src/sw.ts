/// <reference lib="WebWorker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { CacheableResponsePlugin, ExpirationPlugin } from "workbox-cache-expiration";

declare const self: ServiceWorkerGlobalScope;

const APP_SHELL_CACHE = "app-shell-v1";
const DATA_CACHE = "data-cache-v1";
const MEDIA_CACHE = "media-cache-v1";

const APP_SHELL_ROUTES = [
  "/",
  "/index.html",
  "/src/main.tsx",
  "/src/App.tsx",
  "/src/components/ErrorBoundary.tsx",
  "/src/components/ProtectedLayout.tsx",
  "/src/pages/Auth.tsx",
  "/src/pages/Dashboard.tsx",
  "/src/pages/Itinerary.tsx",
  "/src/pages/Explore.tsx",
  "/src/pages/Profile.tsx",
  "/src/pages/Friends.tsx",
  "/src/pages/Community.tsx",
  "/src/pages/Guide.tsx",
  "/src/pages/Landing.tsx",
  "/src/pages/JoinTrip.tsx",
  "/src/pages/NotFound.tsx",
  "/src/components/AIAssistant.tsx",
  "/src/components/SOSPanel.tsx",
  "/src/components/Map3D.tsx",
  "/src/components/ARViewer.tsx",
  "/src/components/DisruptionReplanner.tsx",
  "/src/components/CollaborativePlanner.tsx",
  "/src/hooks/useAuth.tsx",
  "/src/hooks/useLanguage.tsx",
  "/src/lib/http.ts",
  "/src/lib/errors.ts",
  "/src/lib/date.ts",
  "/src/services/aiChat.ts",
  "/src/services/aiPlanner.ts",
  "/src/services/travelMemory.ts",
  "/src/services/gemini.ts",
  "/src/services/nominatim.ts",
  "/src/services/opentripmap.ts",
  "/src/services/traffic.ts",
  "/src/services/amadeus.ts",
  "/src/integrations/supabase/client.ts",
];

const API_ROUTES: RegExp[] = [
  /^https:\/\/api\.groq\.com\/openai\//i,
  /^https:\/\/api\.openweathermap\.org\//i,
  /^https:\/\/nominatim\.openstreetmap\.org\//i,
  /^https:\/\/api\.opentripmap\.com\//i,
  /^https:\/\/api\.open-meteo\.com\//i,
  /^https:\/\/www\.wikipedia\.org\//i,
  /^https:\/\/commons\.wikimedia\.org\//i,
];

const ASSET_ROUTES: RegExp[] = [/^https:\/\/fonts\.googleapis\.com\//i, /^https:\/\/fonts\.gstatic\.com\//i];

const TILE_ROUTES: RegExp[] = [
  /^https:\/\/[abc]\.tile\.openstreetmap\.org\//i,
  /^https:\/\/tile\.openstreetmap\.org\//i,
  /^https:\/\/tile\.opentopomap\.org\//i,
  /^https:\/\/c\.tile-cyclosm\.openstreetmap\.fr\//i,
];

const SUPABASE_ROUTES = [/\.supabase\.co\/rest\//i];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.addAll(APP_SHELL_ROUTES.map((url) => new Request(url, { cache: "reload" })));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      cleanupOutdatedCaches();
      self.clients.claim();
    })(),
  );
});

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request, url }) => {
    if (request.mode === "navigate") {
      return true;
    }
    return false;
  },
  createHandlerBoundToURL("/index.html"),
);

registerRoute(
  ({ url }) => {
    return SUPABASE_ROUTES.some((pattern) => pattern.test(url.href));
  },
  new StaleWhileRevalidate({
    cacheName: "supabase-api",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

registerRoute(
  ({ url }) => {
    return ASSET_ROUTES.some((pattern) => pattern.test(url.href));
  },
  new CacheFirst({
    cacheName: "fonts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

registerRoute(
  ({ url }) => {
    return TILE_ROUTES.some((pattern) => pattern.test(url.href));
  },
  new CacheFirst({
    cacheName: "map-tiles",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

registerRoute(
  ({ url }) => {
    return API_ROUTES.some((pattern) => pattern.test(url.href));
  },
  new StaleWhileRevalidate({
    cacheName: "api-data",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

registerRoute(
  ({ request }) => {
    return request.destination === "image";
  },
  new CacheFirst({
    cacheName: "images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  }),
);

registerRoute(
  ({ request }) => {
    return request.destination === "style" || request.destination === "font";
  },
  new CacheFirst({
    cacheName: "assets",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

declare global {
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: (string | import("workbox-precaching").PrecacheEntry)[];
  }
}

export {};
