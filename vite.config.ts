import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512] as const;
const MASKABLE = new Set([192, 512]);

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
      // No sourcemaps in production output: keeps dist lean and avoids
      // shipping readable source. Flip to "hidden" if you wire up Sentry.
      sourcemap: !isProd,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 700,
      reportCompressedSize: false,
      // Vite 8 minifies with Oxc by default — no explicit engine needed.
      minify: true,
      rolldownOptions: {
        output: {
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          // Split heavy, independently-cacheable vendors so a change in app
          // code doesn't invalidate the whole bundle. Higher priority wins.
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
          description:
            "AI-powered intelligent travel planning — itineraries, safety alerts, group trips & more.",
          theme_color: "#e8390e",
          background_color: "#f5f4f2",
          display: "standalone",
          orientation: "portrait",
          scope: "/",
          start_url: "/",
          categories: ["travel", "navigation", "lifestyle"],
          icons: ICON_SIZES.map((size) => ({
            src: `/icons/icon-${size}x${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
            ...(MASKABLE.has(size) ? { purpose: "any maskable" as const } : {}),
          })),
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
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}"],
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
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-rest",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
                networkTimeoutSeconds: 8,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],

    resolve: {
      // `import.meta.dirname` works with Vite's native config loader, which
      // becomes the default in a future major. Needs Node >= 20.11.
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
    },
  };
});
