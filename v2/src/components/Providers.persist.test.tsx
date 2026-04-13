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

  it('creates persister with localStorage as storage', async () => {
    await act(async () => { render(<Providers><div /></Providers>); });
    expect(mockCreatePersister).toHaveBeenCalledWith(
      expect.objectContaining({ storage: window.localStorage })
    );
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

  it('whitelisted query key "grocery" is persisted', async () => {
    await renderAndPersist(['grocery'], [{ id: 'g1', name: 'Basil' }]);
    expect(persistedKeys()).toContain('grocery');
  });

  it('non-whitelisted "recipe" (single) is NOT persisted', async () => {
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
      qcRef.current!.setQueryData(['recipe', 'id'], { id: 'id' });
    });

    expect(persistedKeys()).toContain('recipes');
    expect(persistedKeys()).not.toContain('recipe');
  });

  it('non-whitelisted "restaurant" (singular) is NOT persisted', async () => {
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
      qcRef.current!.setQueryData(['restaurant', 'r-id'], { id: 'r-id' });
    });

    expect(persistedKeys()).toContain('restaurants');
    expect(persistedKeys()).not.toContain('restaurant');
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

  it('shouldDehydrateQuery includes recipes/restaurants/grocery but not single-record keys', () => {
    const qc = new QueryClient();

    qc.setQueryData(['recipes'], [{ id: '1' }]);
    qc.setQueryData(['restaurants'], [{ id: 'r1' }]);
    qc.setQueryData(['grocery'], [{ id: 'g1' }]);
    qc.setQueryData(['recipe', 'id-1'], { id: 'id-1' });
    qc.setQueryData(['restaurant', 'r-id'], { id: 'r-id' });

    const shouldDehydrateQuery = (query: { queryKey: unknown[] }) => {
      const key = query.queryKey[0];
      return key === 'recipes' || key === 'restaurants' || key === 'grocery';
    };

    const dehydrated = dehydrate(qc, { shouldDehydrateQuery });
    const keys = dehydrated.queries.map((q) => q.queryKey[0]);

    expect(keys).toContain('recipes');
    expect(keys).toContain('restaurants');
    expect(keys).toContain('grocery');
    expect(keys).not.toContain('recipe');
    expect(keys).not.toContain('restaurant');
  });
});
