import withPWA from '@ducanh2912/next-pwa'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: { position: 'bottom-right' },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default withPWA({
  disable: process.env.NODE_ENV === 'development',
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
  customWorkerSrc: 'src/sw',
  workboxOptions: {
    runtimeCaching: [
      {
        // Page navigations — StaleWhileRevalidate serves cached HTML immediately
        // (satisfies NFR03 ≤1s offline load), then updates the cache in the background.
        urlPattern: ({ request }: { request: Request }) =>
          request.mode === 'navigate',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'pages',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [200],
          },
        },
      },
      {
        // API routes: recipes and grocery GET requests — NetworkFirst with offline fallback.
        // GET-only: PUT /api/grocery/[id] is handled by the Background Sync plugin in src/sw/.
        urlPattern: ({ url, request }: { url: URL; request: Request }) =>
          (url.pathname.startsWith('/api/recipes') ||
            url.pathname.startsWith('/api/grocery')) &&
          request.method === 'GET',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'plately-api-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
})(nextConfig)
