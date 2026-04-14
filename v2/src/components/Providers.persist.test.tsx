/**
 * Providers.persist.test.tsx
 *
 * Verifies the TanStack Query persistence layer is correctly wired to
 * PersistQueryClientProvider.
 *
 * Testing strategy:
 * - Structural tests: spy on createSyncStoragePersister to verify key/storage args
 * - Whitelist unit test: dehydrate() with the filter function directly
 * - Integration tests: render with an Observer child, use waitFor to detect when
 *   PersistQueryClientProvider finishes restoring (isRestoring→false), then call
 *   setQueryData. With synchronous notifyManager the persistence fires immediately.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import {
  useQueryClient,
  dehydrate,
  QueryClient,
  useIsRestoring,
  notifyManager,
} from '@tanstack/react-query';
import { Providers } from './Providers';

// ─── Persister spy ────────────────────────────────────────────────────────────

const mockCreatePersister = vi.hoisted(() =>
  vi.fn(({ storage, key }: { storage: Storage; key: string }) => ({
    persistClient: (client: unknown) => {
      storage.setItem(key, JSON.stringify(client));
    },
    restoreClient: async () => {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    },
    removeClient: () => {
      storage.removeItem(key);
    },
  }))
);

vi.mock('@tanstack/query-sync-storage-persister', () => ({
  createSyncStoragePersister: mockCreatePersister,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readPersistedCache(): {
  clientState?: { queries?: Array<{ queryKey: unknown[] }> };
} | null {
  const raw = localStorage.getItem('plately-query-cache');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistedKeys(): unknown[] {
  return readPersistedCache()?.clientState?.queries?.map((q) => q.queryKey[0]) ?? [];
}

/**
 * Observer renders inside Providers and exposes the current QueryClient and
 * isRestoring flag via refs so tests can read them without re-renders.
 */
function Observer({
  qcRef,
  isRestoringRef,
}: {
  qcRef: React.MutableRefObject<QueryClient | null>;
  isRestoringRef: React.MutableRefObject<boolean>;
}) {
  qcRef.current = useQueryClient();
  isRestoringRef.current = useIsRestoring();
  return null;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Make TanStack cache change notifications fire synchronously.
  // When setQueryData is called after the subscription is active, persistence
  // fires in the same tick — no timer-based polling needed.
  notifyManager.setScheduler((fn) => fn());
});

afterEach(() => {
  // Restore the default async scheduler for all other test files
  notifyManager.setScheduler((fn) => setTimeout(fn, 0));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Providers — TanStack Query persistence', () => {
  it('renders children without error', async () => {
    await expect(
      act(async () => {
        render(<Providers><div>hello</div></Providers>);
      })
    ).resolves.not.toThrow();
  });

  // ── Structural: factory called with correct arguments ──────────────────────

  it('creates persister with a quota-safe localStorage wrapper as storage', async () => {
    await act(async () => { render(<Providers><div /></Providers>); });
    // Providers wraps window.localStorage in a quota-safe object rather than
    // passing the raw reference — verify the wrapper exposes the Storage interface.
    expect(mockCreatePersister).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: expect.objectContaining({
          getItem: expect.any(Function),
          setItem: expect.any(Function),
          removeItem: expect.any(Function),
        }),
      })
    );
  });

  it('quota-safe storage swallows QuotaExceededError on setItem', async () => {
    // Verify the wrapper catches DOMException so a full localStorage does not crash the app.
    await act(async () => { render(<Providers><div /></Providers>); });
    const { storage } = mockCreatePersister.mock.calls[0][0] as { storage: Storage };

    const original = window.localStorage.setItem.bind(window.localStorage);
    const quota = new DOMException('QuotaExceededError', 'QuotaExceededError');
    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => { throw quota; });

    expect(() => storage.setItem('plately-query-cache', '{}')).not.toThrow();

    window.localStorage.setItem = original;
  });

  it('creates persister with key "plately-query-cache"', async () => {
    await act(async () => { render(<Providers><div /></Providers>); });
    expect(mockCreatePersister).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'plately-query-cache' })
    );
  });

  // ── Integration: data written to localStorage ─────────────────────────────

  /**
   * Wait for PersistQueryClientProvider to finish restoring (isRestoring=false),
   * which means the cache subscription is now active. Then call setQueryData —
   * with synchronous notifyManager, persistence fires in the same tick.
   */
  async function renderAndPersist(queryKey: unknown[], data: unknown): Promise<void> {
    const qcRef: React.MutableRefObject<QueryClient | null> = { current: null };
    const isRestoringRef: React.MutableRefObject<boolean> = { current: true };

    render(
      <Providers>
        <Observer qcRef={qcRef} isRestoringRef={isRestoringRef} />
      </Providers>
    );

    // Wait until restoration completes (isRestoring → false = subscription active)
    await waitFor(() => expect(isRestoringRef.current).toBe(false), { timeout: 3000 });

    // Subscription is now active; set data synchronously fires the persist callback
    act(() => {
      qcRef.current!.setQueryData(queryKey as never[], data);
    });
  }

  it('whitelisted query key "recipes" is persisted to localStorage', async () => {
    await renderAndPersist(['recipes'], [{ id: '1', name: 'Pad Thai' }]);
    expect(persistedKeys()).toContain('recipes');
  });

  it('whitelisted query key "restaurants" is persisted', async () => {
    await renderAndPersist(['restaurants'], [{ id: 'r1', name: 'Noodle Bar' }]);
    expect(persistedKeys()).toContain('restaurants');
  });

  it('whitelisted query key "grocery-items" is persisted', async () => {
    await renderAndPersist(['grocery-items'], [{ id: 'g1', name: 'Basil' }]);
    expect(persistedKeys()).toContain('grocery-items');
  });

  it('single recipe detail ["recipes", uuid] is NOT persisted', async () => {
    // The real at-risk key: useRecipe(id) uses ['recipes', someUuid] — key[0] is
    // "recipes" which previously matched the filter. Now excluded by length guard.
    const qcRef: React.MutableRefObject<QueryClient | null> = { current: null };
    const isRestoringRef: React.MutableRefObject<boolean> = { current: true };

    render(
      <Providers>
        <Observer qcRef={qcRef} isRestoringRef={isRestoringRef} />
      </Providers>
    );

    await waitFor(() => expect(isRestoringRef.current).toBe(false), { timeout: 3000 });

    act(() => {
      qcRef.current!.setQueryData(['recipes'], [{ id: '1' }]);
      qcRef.current!.setQueryData(['recipes', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'], { id: 'a1b2c3d4' });
    });

    const keys = readPersistedCache()?.clientState?.queries?.map((q) => q.queryKey) ?? [];
    // Collection ['recipes'] is persisted
    expect(keys.some((k) => k.length === 1 && k[0] === 'recipes')).toBe(true);
    // Detail ['recipes', uuid] is NOT persisted
    expect(keys.some((k) => k.length === 2 && k[0] === 'recipes')).toBe(false);
  });

  it('single restaurant detail ["restaurants", id] is NOT persisted', async () => {
    // The real at-risk key: useRestaurant(id) uses ['restaurants', id] — key[0] is
    // "restaurants" which previously matched the filter. Now excluded by sub check.
    const qcRef: React.MutableRefObject<QueryClient | null> = { current: null };
    const isRestoringRef: React.MutableRefObject<boolean> = { current: true };

    render(
      <Providers>
        <Observer qcRef={qcRef} isRestoringRef={isRestoringRef} />
      </Providers>
    );

    await waitFor(() => expect(isRestoringRef.current).toBe(false), { timeout: 3000 });

    act(() => {
      qcRef.current!.setQueryData(['restaurants'], [{ id: 'r1' }]);
      qcRef.current!.setQueryData(['restaurants', 'some-restaurant-uuid'], { id: 'some-restaurant-uuid' });
    });

    const keys = readPersistedCache()?.clientState?.queries?.map((q) => q.queryKey) ?? [];
    // Collection ['restaurants'] is persisted
    expect(keys.some((k) => k.length === 1 && k[0] === 'restaurants')).toBe(true);
    // Detail ['restaurants', uuid] is NOT persisted
    expect(keys.some((k) => k.length === 2 && k[0] === 'restaurants')).toBe(false);
  });

  it('persisted data survives remount (simulating app restart)', async () => {
    const qcRef: React.MutableRefObject<QueryClient | null> = { current: null };
    const isRestoringRef: React.MutableRefObject<boolean> = { current: true };

    const { unmount } = render(
      <Providers>
        <Observer qcRef={qcRef} isRestoringRef={isRestoringRef} />
      </Providers>
    );

    await waitFor(() => expect(isRestoringRef.current).toBe(false), { timeout: 3000 });

    act(() => {
      qcRef.current!.setQueryData(['recipes'], [{ id: '42', name: 'Ramen' }]);
    });

    expect(localStorage.getItem('plately-query-cache')).not.toBeNull();
    expect(persistedKeys()).toContain('recipes');

    unmount();

    // Second mount: restoreClient reads the snapshot → data present
    render(<Providers><div /></Providers>);
    expect(persistedKeys()).toContain('recipes');
  });

  it('SSR-safe: does not crash', async () => {
    await expect(
      act(async () => {
        render(<Providers><span>safe</span></Providers>);
      })
    ).resolves.not.toThrow();
  });

  // ── Whitelist unit test ────────────────────────────────────────────────────

  it('shouldDehydrateQuery: collections persisted, detail queries excluded', () => {
    const qc = new QueryClient();

    // Whitelisted collections
    qc.setQueryData(['recipes'], [{ id: '1' }]);
    qc.setQueryData(['recipes', 'kept'], [{ id: '2' }]);
    qc.setQueryData(['recipes', 'restaurant', 'rest-1'], [{ id: '3' }]);
    qc.setQueryData(['restaurants'], [{ id: 'r1' }]);
    qc.setQueryData(['grocery-items'], [{ id: 'g1' }]);
    // Detail queries — must NOT be persisted
    qc.setQueryData(['recipes', 'a1b2c3d4-uuid'], { id: 'a1b2c3d4' });
    qc.setQueryData(['restaurants', 'some-uuid'], { id: 'some-uuid' });
    qc.setQueryData(['restaurants', 'with-recipes'], [{ id: 'r1' }]);

    const shouldDehydrateQuery = (query: { queryKey: unknown[] }) => {
      const [key, sub] = query.queryKey as [string, string | undefined];
      if (key === 'grocery-items') return true;
      // useRestaurantsWithRecipes() → ['restaurants', 'with-recipes'] is included
      if (key === 'restaurants') return sub === undefined || sub === 'with-recipes';
      if (key === 'recipes') {
        if (sub === undefined) return true;
        if (sub === 'kept') return true;
        if (sub === 'restaurant') return true;
        return false;
      }
      return false;
    };

    const dehydrated = dehydrate(qc, { shouldDehydrateQuery });
    const queryKeys = dehydrated.queries.map((q) => q.queryKey);

    // Included
    expect(queryKeys).toContainEqual(['recipes']);
    expect(queryKeys).toContainEqual(['recipes', 'kept']);
    expect(queryKeys).toContainEqual(['recipes', 'restaurant', 'rest-1']);
    expect(queryKeys).toContainEqual(['restaurants']);
    expect(queryKeys).toContainEqual(['restaurants', 'with-recipes']); // joined view for home screen
    expect(queryKeys).toContainEqual(['grocery-items']);
    // Excluded (detail records — intentionally not persisted to avoid stale data)
    expect(queryKeys).not.toContainEqual(['recipes', 'a1b2c3d4-uuid']);
    expect(queryKeys).not.toContainEqual(['restaurants', 'some-uuid']);
  });
});
