'use client';

/**
 * InstallPromptBanner
 *
 * Shows a bottom-anchored frosted banner prompting the user to install Plately
 * as a PWA. Visible when:
 *   • the browser has fired `beforeinstallprompt` (deferred here), AND
 *   • the user has saved at least one recipe (listens for `plately:first-save`
 *     custom event OR sessionStorage has any scan result key), AND
 *   • the banner has not been permanently dismissed (localStorage flag)
 *
 * Dismissal is persisted to localStorage so it survives page reloads.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FrostedCard } from '@/components/ui/FrostedCard';

const DISMISSED_KEY = 'plately:install-dismissed';

// The BeforeInstallPromptEvent is not in the standard TypeScript lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Check whether the user has already dismissed the banner
  const isDismissed = useCallback(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }, []);

  // Check whether at least one scan result is in sessionStorage
  const hasAnyScan = useCallback(() => {
    try {
      return sessionStorage.length > 0;
    } catch {
      return false;
    }
  }, []);

  const maybeShow = useCallback(() => {
    if (!isDismissed() && hasAnyScan()) {
      setVisible(true);
    }
  }, [isDismissed, hasAnyScan]);

  useEffect(() => {
    // Capture the beforeinstallprompt event before the browser shows its own UI
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      maybeShow();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Also listen for the explicit first-save signal from the recipe detail page
    const handleFirstSave = () => maybeShow();
    window.addEventListener('plately:first-save', handleFirstSave);

    // If we already have a deferred prompt (rare: registered before component mounted)
    // and a scan exists, show immediately
    maybeShow();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('plately:first-save', handleFirstSave);
    };
  }, [maybeShow]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setVisible(false);
      try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* ignore */ }
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* ignore */ }
  }, []);

  // Don't render until the browser fires beforeinstallprompt (respects already-installed state)
  if (!deferredPrompt && !visible) return null;

  const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 };
  const animate = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
  const exit = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 };
  const transition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, stiffness: 380, damping: 28 };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="alert"
          aria-label="Install Plately"
          initial={initial}
          animate={animate}
          exit={exit}
          transition={transition}
          style={{
            position: 'fixed',
            bottom: 'calc(var(--tab-bar-height) + var(--space-safe-bottom) + 12px)',
            left: '16px',
            right: '16px',
            zIndex: 50,
          }}
        >
          <FrostedCard elevated className="flex items-start gap-3 p-4">
            {/* Icon */}
            <div
              aria-hidden="true"
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-[var(--radius-md)]"
              style={{ background: 'var(--color-accent-light)' }}
            >
              <HomeScreenIcon />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold leading-snug mb-0.5"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Add Plately to your home screen
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                One-tap access to your recipes and grocery list — even offline.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <button
                onClick={handleInstall}
                aria-label="Install Plately"
                className="btn-pill btn-primary h-9 px-4 text-xs"
                style={{ height: 36, minHeight: 36 }}
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="text-xs px-2"
                style={{
                  color: 'var(--color-text-tertiary)',
                  background: 'none',
                  border: 'none',
                  minHeight: 28,
                  height: 28,
                }}
              >
                Not now
              </button>
            </div>
          </FrostedCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HomeScreenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="3" stroke="var(--color-accent)" strokeWidth="1.75" />
      <path d="M9 7h6M9 11h6M9 15h3" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
