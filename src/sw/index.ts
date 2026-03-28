// Custom service worker additions merged into the next-pwa generated worker.
// DO NOT import React or Next.js modules here — this runs in the service worker context.
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

const bgSyncPlugin = new BackgroundSyncPlugin('grocery-sync-queue', {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
})

// Queue PUT /api/grocery/[id] requests when offline and replay on reconnect.
// GET requests to /api/grocery are handled by the NetworkFirst rule in next.config.ts.
registerRoute(
  ({ url, request }: { url: URL; request: Request }) =>
    url.pathname.startsWith('/api/grocery/') && request.method === 'PUT',
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  'PUT'
)
