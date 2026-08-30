import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
    },

    preview: { host: "::", port: 8080 },

    build: {
      target: "es2022",
      sourcemap: !isProd,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 700,
      reportCompressedSize: false,
      minify: true,
      rolldownOptions: {
        output: {
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          advancedChunks: {
            groups: [
              { name: "vendor-react", priority: 40, test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: "vendor-maplibre", priority: 35, test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/ },
              { name: "vendor-pdf", priority: 35, test: /[\\/]node_modules[\\/](jspdf|jspdf-autotable|html2canvas|dompurify)[\\/]/ },
              { name: "vendor-leaflet", priority: 30, test: /[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/ },
              { name: "vendor-supabase", priority: 30, test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
              { name: "vendor-markdown", priority: 25, test: /[\\/]node_modules[\\/](react-markdown|remark-.*|rehype-.*|micromark.*|mdast-.*|unist-.*|hast-.*|vfile.*|character-entities.*|property-information|comma-separated-tokens|space-separated-tokens|html-url-attributes|zwitch|longest-streak|trim-lines|bail|trough|is-plain-obj|unified|devlop|decode-named-character-reference|estree-util-is-identifier-name|style-to-js|style-to-object|inline-style-parser)[\\/]/ },
              { name: "vendor-router", priority: 20, test: /[\\/]node_modules[\\/](react-router|react-router-dom)[\\/]/ },
              { name: "vendor-query", priority: 20, test: /[\\/]node_modules[\\/]@tanstack[\\/]/ },
              { name: "vendor-radix", priority: 15, test: /[\\/]node_modules[\\/]@radix-ui[\\/]/ },
              { name: "vendor-icons", priority: 15, test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
              { name: "vendor", priority: 1, test: /[\\/]node_modules[\\/]/ },
            ],
          },
        },
      },
    },

    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "favicon.svg", "icons/*.png"],
        manifest: {
          name: "Radiator Routes",
          short_name: "RadRoutes",
          description: "AI-powered intelligent travel planning — itineraries, safety alerts, group trips & offline support.",
          theme_color: "#e8390e",
          background_color: "#f5f4f2",
          display: "standalone",
          orientation: "portrait",
          scope: "/",
          start_url: "/",
          categories: ["travel", "navigation", "lifestyle"],
          icons: [
            { src: "/icons/icon-72x72.png", sizes: "72x72", type: "image/png" },
            { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
            { src: "/icons/icon-128x128.png", sizes: "128x128", type: "image/png" },
            { src: "/icons/icon-144x144.png", sizes: "144x144", type: "image/png" },
            { src: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
            { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: "/icons/icon-384x384.png", sizes: "384x384", type: "image/png" },
            { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
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
              name: "Explore",
              short_name: "Explore",
              description: "Explore destinations",
              url: "/explore",
              icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
            },
            {
              name: "Itinerary",
              short_name: "Itinerary",
              description: "View your itinerary",
              url: "/itinerary",
              icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
            },
            {
              name: "Profile",
              short_name: "Profile",
              description: "View your profile",
              url: "/profile",
              icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
            },
          ],
          prefer_related_applications: false,
          related_applications: [
            {
              platform: "play",
              url: "https://play.google.com/store/apps/details?id=com.radiatorroutes",
              id: "com.radiatorroutes",
            },
          ],
          handle_links: "preferred",
          launch_handler: { client_mode: "auto" },
          edge_side_panel: { preferred_width: 320 },
          clipboard_write: "default",
          display_override: ["minimal-ui", "standalone", "browser"],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2,woff,json}"],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "osm-tiles-offline",
                expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "osm-tiles-offline",
                expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "nominatim",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "weather",
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 15 },
                networkTimeoutSeconds: 6,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/api\.opentripmap\.com\/.*/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "opentripmap",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/en\.wikipedia\.org\/.*/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "wikipedia",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/commons\.wikimedia\.org\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "wikimedia",
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "supabase-rest",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/tile\.opentopomap\.org\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "topo-maps",
                expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/search/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "nominatim-search",
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
        srcDSW: "src/sw.ts",
      }),
    ],

    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
    },
  };
});
