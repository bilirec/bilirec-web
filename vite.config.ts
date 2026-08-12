import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { resolve } from 'path'

const umamiUrl = process.env.UMAMI_URL?.trim() ?? "";
const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID?.trim() ?? "";

export default defineConfig({
  envPrefix: ["VITE_", "UMAMI_"],
  define: {
    "import.meta.env.UMAMI_URL": JSON.stringify(umamiUrl),
    "import.meta.env.UMAMI_WEBSITE_ID": JSON.stringify(umamiWebsiteId),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      scope: '/',
      injectRegister: false,
      manifest: {
        name: 'Bilibili 錄製管理系統',
        short_name: '錄製管理',
        description: '管理 Bilibili 直播錄製任務',
        start_url: '/',
        display: 'standalone',
        background_color: '#f2f4f6',
        theme_color: '#7db3e8',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
