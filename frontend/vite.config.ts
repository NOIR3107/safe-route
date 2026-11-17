/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "SafeRoute – Evacuation Command",
        short_name: "SafeRoute",
        description: "Disaster evacuation & shelter allocation decision support",
        theme_color: "#131417",
        background_color: "#131417",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Cesium's runtime files are cached when first used, not precached (they are large).
        globIgnores: ["cesium/**"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/cesium/"),
            handler: "CacheFirst",
            options: { cacheName: "cesium-runtime", expiration: { maxEntries: 400 } },
          },
          {
            // Basemap tiles already seen, so the field map degrades gracefully offline.
            urlPattern: /^https:\/\/services\.arcgisonline\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "basemap-tiles",
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // CesiumJS loads its web workers and images from here (copied by scripts/copy-cesium.mjs).
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium") },
  // Pre-bundle Cesium up front so the first lazy map import does not trigger a re-optimisation.
  optimizeDeps: { include: ["cesium"] },
  server: { port: 5173, strictPort: true },
  // Cesium is a large library; it lives in its own lazily loaded chunk.
  build: { chunkSizeWarningLimit: 4500 },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
