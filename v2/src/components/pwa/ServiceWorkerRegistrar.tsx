'use client';

/**
 * ServiceWorkerRegistrar
 *
 * Mounts with no visible output. Registers /sw.js on the service worker
 * navigator when the component mounts (client-side only). Placed in the root
 * layout so every page benefits from SW registration.
 */

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Listen for replayed grocery actions from the SW (queued while offline).
        // localStorage is already up-to-date (the action was applied when the user
        // tapped). On replay we only need to sync the change to Supabase.
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type !== 'REPLAY_GROCERY_ACTION') return;
          const action = event.data.action as { kind: string; itemId: string };
          if (!action?.kind || !action?.itemId) return;

          if (action.kind === 'toggle') {
            // Read the current checked state from localStorage and push it to Supabase.
            try {
              const raw = localStorage.getItem('plately_grocery');
              if (!raw) return;
              const items: Array<{ id: string; checked: boolean }> = JSON.parse(raw);
              if (!Array.isArray(items)) return;
              const item = items.find((i) => i.id === action.itemId);
              if (!item) return;
              void supabase
                .from('grocery_items')
                .update({ checked: item.checked })
                .eq('id', action.itemId);
            } catch {
              // Silently ignore storage errors
            }
          } else if (action.kind === 'remove') {
            void supabase
              .from('grocery_items')
              .delete()
              .eq('id', action.itemId);
          }
        });

        // Check for waiting SW update on each page visibility change
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => { /* ignore network errors */ });
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      })
      .catch(() => {
        // SW registration failures are non-fatal; app works without it
      });
  }, []);

  return null;
}
