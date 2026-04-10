/**
 * Plately v2 — Service Worker
 *
 * Responsibilities:
 * 1. Shell caching — cache-first for static assets; network-first for pages
 * 2. Offline grocery sync — queue toggle/remove actions when offline,
 *    replay on reconnect via Background Sync (with online-event fallback)
 *
 * Grocery data lives in localStorage (grocery-store.ts, key: "plately_grocery").
 * The SW cannot write to localStorage directly, but it:
 *  - Intercepts POST messages from the page for toggle/remove actions
 *  - Stores the pending queue in IndexedDB ("plately-sw-db", store "sync-queue")
 *  - Processes the queue when back online by posting to all clients
 */

const CACHE_NAME = 'plately-shell-v1';
// Separate cache for API reads so stale-while-revalidate entries can be
// expired independently without evicting the app shell.
const API_CACHE_NAME = 'plately-api-v1';
const SYNC_TAG = 'plately-grocery-sync';

// Static shell assets to pre-cache on install
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const KNOWN_CACHES = [CACHE_NAME, API_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !KNOWN_CACHES.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch — shell caching strategy ──────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests; skip non-GET (API mutations, etc.)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip Next.js internals / HMR
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // API reads — stale-while-revalidate (return cache immediately, refresh in background).
  // Covers GET /api/recipes, /api/restaurants, /api/grocery, /api/places/search, etc.
  // Mutations (POST/PUT/DELETE) are excluded above by the method !== 'GET' guard.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);

        // Start network fetch regardless (background revalidation)
        const networkPromise = fetch(request).then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => null);

        // Return cached immediately if available; otherwise wait for network
        if (cached) {
          // Revalidation runs in the background without blocking the response
          event.waitUntil(networkPromise);
          return cached;
        }
        return networkPromise.then((res) => res ?? Response.error());
      })
    );
    return;
  }

  // Next.js static chunks — cache-first (immutable content-hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Page navigations — network-first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/')))
    );
    return;
  }
});

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = 'plately-sw-db';
const DB_VERSION = 1;
const STORE_NAME = 'sync-queue';

/** Open (or upgrade) the IndexedDB database */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      /** @type {IDBDatabase} */
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

/** Append an action to the sync queue */
async function enqueueAction(action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add({ ...action, queuedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Read all queued actions */
async function readQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const items = [];
    const cursor = store.openCursor();
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        items.push({ key: c.key, value: c.value });
        c.continue();
      } else {
        resolve(items);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

/** Delete a queued action by its IDB key */
async function dequeueAction(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Message handler — pages post grocery actions here ────────────────────────

/**
 * Page usage (from a client component):
 *
 *   navigator.serviceWorker.controller?.postMessage({
 *     type: 'GROCERY_ACTION',
 *     action: { kind: 'toggle' | 'remove', itemId: string }
 *   });
 */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'GROCERY_ACTION') return;
  const action = event.data.action;
  if (!action?.kind || !action?.itemId) return;

  event.waitUntil(
    enqueueAction(action).then(() => {
      // Attempt Background Sync registration; falls back to online listener
      if ('sync' in self.registration) {
        return self.registration.sync.register(SYNC_TAG).catch(() => {
          // Background Sync not supported — rely on online event
        });
      }
    })
  );
});

// ─── Background Sync handler ─────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

// ─── Online fallback (1.5 s debounce) ────────────────────────────────────────

let replayTimer = null;

self.addEventListener('online', () => {
  if (replayTimer) clearTimeout(replayTimer);
  replayTimer = setTimeout(() => {
    replayTimer = null;
    replayQueue();
  }, 1500);
});

// ─── Queue replay ─────────────────────────────────────────────────────────────

/**
 * Replay all queued grocery actions by posting them back to all open clients.
 * The client (grocery-store.ts) applies the mutations locally (localStorage).
 * This is the correct approach for a localStorage-backed store: the SW cannot
 * write to localStorage, so it delegates back to the page context.
 */
async function replayQueue() {
  const items = await readQueue();
  if (items.length === 0) return;

  const allClients = await self.clients.matchAll({ type: 'window' });
  if (allClients.length === 0) return; // No open tabs — try again on next sync

  for (const { key, value } of items) {
    // Broadcast the action to all open windows so any open tab can apply it
    for (const client of allClients) {
      client.postMessage({ type: 'REPLAY_GROCERY_ACTION', action: value });
    }
    await dequeueAction(key);
  }
}
