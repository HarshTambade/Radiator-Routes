import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "icons/*.png"],
      manifest: {
        name: "Radiator Routes",
        short_name: "RadRoutes",
        description:
          "AI-powered intelligent travel planning — itineraries, safety alerts, group trips & more.",
        theme_color: "#e8390e",
        background_color: "#f5f4f2",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-72x72.png",
            sizes: "72x72",
            type: "image/png",
          },
          {
            src: "/icons/icon-96x96.png",
            sizes: "96x96",
            type: "image/png",
          },
          {
            src: "/icons/icon-128x128.png",
            sizes: "128x128",
            type: "image/png",
          },
          {
            src: "/icons/icon-144x144.png",
            sizes: "144x144",
            type: "image/png",
          },
          {
            src: "/icons/icon-152x152.png",
            sizes: "152x152",
            type: "image/png",
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/icon-384x384.png",
            sizes: "384x384",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        categories: ["travel", "navigation", "lifestyle"],
        screenshots: [
          {
            src: "/screenshots/dashboard.png",
            sizes: "1280x720",
            type: "image/png",
            label: "Dashboard",
          },
        ],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Home",
            description: "Go to your trip dashboard",
            url: "/dashboard",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "New Trip",
            short_name: "New Trip",
            description: "Plan a new trip",
            url: "/dashboard",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "Explore",
            short_name: "Explore",
            description: "Explore destinations",
            url: "/explore",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.groq\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "groq-api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/gnews\.io\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "gnews-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 15 },
            },
          },
          // ── OpenStreetMap tiles — CacheFirst (30 days) ──────────────────
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles-offline",
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Supabase REST API — NetworkFirst with 24h offline fallback ──
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-rest-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Nominatim geocoding — StaleWhileRevalidate (7 days) ─────────
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "nominatim-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── OpenTripMap — StaleWhileRevalidate (24h) ─────────────────────
          {
            urlPattern: /^https:\/\/api\.opentripmap\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "opentripmap-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ── Open-Meteo weather — NetworkFirst (15 min) ────────────────────
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "weather-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 15,
              },
              networkTimeoutSeconds: 6,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: mode === "development",
        type: "module",
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
