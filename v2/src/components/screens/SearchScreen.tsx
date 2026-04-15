"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { recordSearchVisit } from "@/components/banners/SmartBanner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// ─── Types ─────────────────────────────────────────────────

interface RestaurantResult {
  placeId: string;
  name: string;
  address: string;
  rating?: number | null;
  userRatingCount?: number | null;
  photoUrl?: string | null;
}

// ─── Constants ──────────────────────────────────────────────

const RECENT_KEY = "plately-recent-searches";
const MAX_RECENT = 5;
const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 300;

// ─── Hooks ──────────────────────────────────────────────────

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function useRecentSearches() {
  const [recents, setRecents] = useState<string[]>([]);

  // Read from localStorage once on mount (client only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setRecents(parsed as string[]);
      }
    } catch {
      // ignore
    }
  }, []);

  const save = (term: string) => {
    const normalized = term.trim();
    if (!normalized) return;
    setRecents((prev) => {
      const updated = [
        normalized,
        ...prev.filter((t) => t.toLowerCase() !== normalized.toLowerCase()),
      ].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });
  };

  const clear = () => {
    setRecents([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
  };

  return { recents, save, clear };
}

// ─── Animation variants ─────────────────────────────────────

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 28, stiffness: 360 },
  },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

// ─── SearchScreen ───────────────────────────────────────────

export function SearchScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const isOnline = useOnlineStatus();

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [inputFocused, setInputFocused] = useState(false);
  const [results, setResults] = useState<RestaurantResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isError, setIsError] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Request location on mount — fires the native browser prompt once.
  // Silently degrades to unbiased search if denied or unavailable.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* denied or unavailable — search works without it */ }
    );
  }, []);

  const debouncedQuery = useDebounced(query, DEBOUNCE_MS);

  // Sync query to URL so router.back() from a restaurant restores the search state
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedQuery.trim()) {
      params.set("q", debouncedQuery.trim());
    } else {
      params.delete("q");
    }
    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);
  const { recents, save: saveRecent, clear: clearRecents } = useRecentSearches();

  // Fetch results whenever debounced query meets the length threshold
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setNextPageToken(null);
      setIsError(false);
      return;
    }

    // Offline guard — show specific offline state, don't attempt the API call
    if (!isOnline) {
      setResults([]);
      setNextPageToken(null);
      setIsError(false); // not an error, just offline
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    setNextPageToken(null);

    fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed, ...(coords ?? {}) }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((json: { data?: RestaurantResult[]; nextPageToken?: string }) => {
        if (cancelled) return;
        setResults(json.data ?? []);
        setNextPageToken(json.nextPageToken ?? null);
      })
      .catch(() => {
        if (!cancelled) setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  // coords is intentionally excluded: we don't want to re-fire the search
  // just because location resolved. It will be included on the next keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, isOnline]);

  // Fetch the next page and append to existing results
  const fetchMore = useCallback(() => {
    if (!nextPageToken || isFetchingMore || isLoading) return;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_QUERY_LEN) return;

    setIsFetchingMore(true);

    fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed, ...(coords ?? {}), pageToken: nextPageToken }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((json: { data?: RestaurantResult[]; nextPageToken?: string }) => {
        setResults((prev) => [...prev, ...(json.data ?? [])]);
        setNextPageToken(json.nextPageToken ?? null);
      })
      .catch((err) => {
        console.error("[fetchMore] failed:", err);
        // Non-fatal — user can scroll back to re-trigger
      })
      .finally(() => {
        setIsFetchingMore(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPageToken, isFetchingMore, isLoading, debouncedQuery]);

  // Keep a stable ref to the latest fetchMore so the observer never needs to
  // re-subscribe just because isFetchingMore flipped — that was causing the loop.
  const fetchMoreRef = useRef<() => void>(() => {});
  useEffect(() => { fetchMoreRef.current = fetchMore; }, [fetchMore]);

  // IntersectionObserver — only re-subscribes when nextPageToken changes
  // (i.e. a new page has loaded), not on every isFetchingMore state flip.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextPageToken) return;

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchMoreRef.current(); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextPageToken]);

  const handleCardTap = (result: RestaurantResult) => {
    saveRecent(debouncedQuery.trim());
    recordSearchVisit(result.name, 0);
    const photoParam = result.photoUrl ? `&photoUrl=${encodeURIComponent(result.photoUrl)}` : '';
    router.push(`/restaurants/${encodeURIComponent(result.placeId)}?name=${encodeURIComponent(result.name)}${photoParam}`);
  };

  const handleRecentTap = (term: string) => {
    setQuery(term);
    saveRecent(term);
    inputRef.current?.focus();
  };

  const showRecents =
    !inputFocused && query === "" && recents.length > 0;
  const showResults = debouncedQuery.trim().length >= MIN_QUERY_LEN;

  return (
    <div className="min-h-full flex flex-col px-4">
      {/* Header */}
      <motion.div
        className="pt-[calc(var(--space-safe-top)+20px)] pb-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1
          className="text-[1.75rem] tracking-[-0.02em] mb-4"
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            color: "var(--color-text-primary)",
          }}
        >
          Find a Restaurant
        </h1>

        {/* Search input */}
        <FrostedCard noPadding className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 h-[52px]">
            <SearchInputIcon />
            <input
              ref={inputRef}
              type="text"
              placeholder="Restaurant name or address…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--color-text-tertiary)]"
              style={{
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
              }}
              aria-label="Search restaurants"
            />
            {isLoading && <SpinnerIcon />}
            {!isLoading && query.length > 0 && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                style={{ background: "rgba(180,170,158,0.28)" }}
              >
                <ClearIcon />
              </button>
            )}
          </div>
        </FrostedCard>
      </motion.div>

      {/* Offline notice — shown when debounced query meets threshold but device is offline */}
      {!isOnline && debouncedQuery.trim().length >= MIN_QUERY_LEN && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-3 text-center"
          style={{
            background: "rgba(251,243,226,0.95)", // amber tint — same as ScanConfidenceBanner
            borderRadius: 12,
            margin: "0 16px",
            color: "var(--color-text-primary)",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600 }}>No internet connection</p>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Restaurant search requires network access. Your saved collection is available offline.
          </p>
        </div>
      )}

      {/* Recent searches */}
      <AnimatePresence>
        {showRecents && (
          <motion.div
            key="recents"
            variants={listVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            className="flex flex-col gap-2 mb-4"
          >
            {/* Section header */}
            <div className="flex items-center justify-between px-1">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Recent
              </span>
              <button
                onClick={clearRecents}
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
                aria-label="Clear recent searches"
              >
                Clear
              </button>
            </div>

            {recents.map((term) => (
              <motion.div key={term} variants={rowVariants}>
                <FrostedCard
                  noPadding
                  className="flex items-center gap-3 px-4 cursor-pointer"
                  style={{ height: 48 }}
                  onClick={() => handleRecentTap(term)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Search for ${term}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRecentTap(term);
                    }
                  }}
                >
                  <ClockIcon />
                  <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                    {term}
                  </span>
                </FrostedCard>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {showResults && (
          <motion.div
            key="results"
            variants={listVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            className="flex flex-col gap-2"
          >
            {/* Error state */}
            {isError && (
              <motion.div variants={rowVariants}>
                <FrostedCard className="flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    Search is temporarily unavailable.
                  </p>
                  <button
                    onClick={() => setQuery((q) => q + " ")}
                    className="text-xs font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Try again
                  </button>
                </FrostedCard>
              </motion.div>
            )}

            {/* Empty state — only shown when online; offline case shows the notice above */}
            {!isLoading && !isError && isOnline && results.length === 0 && (
              <motion.div variants={rowVariants}>
                <p
                  className="text-sm text-center py-6"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  No restaurants found for &ldquo;{debouncedQuery.trim()}&rdquo;
                </p>
              </motion.div>
            )}

            {/* Restaurant cards */}
            {results.map((result) => (
              <motion.div key={result.placeId} variants={rowVariants}>
                <RestaurantCard result={result} onTap={handleCardTap} />
              </motion.div>
            ))}

            {/* Lazy-load sentinel + spinner */}
            {nextPageToken && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                {isFetchingMore && <SpinnerIcon />}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle hint */}
      {!showResults && !showRecents && (
        <motion.p
          className="text-sm text-center pt-12"
          style={{ color: "var(--color-text-tertiary)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Search for a place you&apos;ve visited
        </motion.p>
      )}

      {/* Suggestion copy */}
      <p
        className="text-xs text-center mt-auto pb-4"
        style={{ color: "var(--color-text-disabled)" }}
      >
        Try: &apos;carbonara&apos;, &apos;sushi&apos;, &apos;bistro near me&apos;
      </p>

    </div>
  );
}

// ─── RestaurantCard ─────────────────────────────────────────

function RestaurantCard({
  result,
  onTap,
}: {
  result: RestaurantResult;
  onTap: (result: RestaurantResult) => void;
}) {
  return (
    <FrostedCard
      noPadding
      className="flex gap-3 p-3 cursor-pointer overflow-hidden focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
      onClick={() => onTap(result)}
      role="button"
      tabIndex={0}
      aria-label={`View ${result.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap(result);
        }
      }}
    >
      {/* Thumbnail */}
      {result.photoUrl ? (
        <img
          src={result.photoUrl}
          alt={result.name}
          className="rounded-lg object-cover flex-shrink-0"
          style={{ width: 56, height: 56 }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            width: 56,
            height: 56,
            background: "var(--color-surface)",
          }}
        >
          <UtensilsIcon />
        </div>
      )}

      {/* Text */}
      <div className="flex flex-col justify-center gap-0.5 min-w-0">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {result.name}
        </p>
        {result.address && (
          <p
            className="text-xs truncate"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {result.address}
          </p>
        )}
        {result.rating != null && (
          <div className="flex items-center gap-1 mt-0.5">
            <StarIcon />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1 }}>
              {result.rating.toFixed(1)}
            </span>
            {result.userRatingCount != null && (
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1 }}>
                ({result.userRatingCount.toLocaleString()})
              </span>
            )}
          </div>
        )}
      </div>
    </FrostedCard>
  );
}

// ─── Icons ─────────────────────────────────────────────────

function SearchInputIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="var(--color-text-tertiary)" strokeWidth="1.75" />
      <path d="M16.5 16.5L21 21" stroke="var(--color-text-tertiary)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      aria-label="Loading"
      style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--color-text-tertiary)"
        strokeWidth="2.5"
        strokeDasharray="14 42"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="var(--color-text-tertiary)" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--color-accent)" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function UtensilsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 2v20" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
