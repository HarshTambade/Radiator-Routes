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
