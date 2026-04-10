"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import {
  type GroceryItem,
  readGroceryList,
  toggleGroceryItem,
  removeGroceryItem,
  clearCheckedItems,
  clearGroceryList,
} from "@/lib/grocery-store";
import {
  useGroceryItems,
  useCheckGroceryItem,
  useDeleteGroceryItem,
  useClearChecked,
} from "@/hooks/useGrocery";
import type { DomainGroceryItem } from "@/types/database";

// ─── Types ─────────────────────────────────────────────────

/**
 * Unified item shape used by the render layer.
 * Covers both the local GroceryItem (grocery-store.ts) and
 * the Supabase DomainGroceryItem shapes.
 */
interface UnifiedItem {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  checked: boolean;
  dishName: string;
  restaurantName: string | null;
  /** true = came from Supabase; mutations use the Supabase hooks */
  isSupabase: boolean;
}

interface DishGroup {
  dishName: string;
  restaurantName: string | null;
  items: UnifiedItem[];
}

type ViewMode = "grouped" | "flat";

const VIEW_MODE_KEY = "plately_grocery_view";

// ─── Helpers ───────────────────────────────────────────────

function localToUnified(item: GroceryItem): UnifiedItem {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    checked: item.checked,
    dishName: item.dishName,
    restaurantName: item.restaurantName,
    isSupabase: false,
  };
}

function supabaseToUnified(item: DomainGroceryItem): UnifiedItem {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    dishName: item.name,          // Supabase items don't carry a dishName; use item name as group key
    restaurantName: null,
    isSupabase: true,
  };
}

function groupByDish(items: UnifiedItem[]): DishGroup[] {
  const map = new Map<string, DishGroup>();
  for (const item of items) {
    const key = `${item.dishName}::${item.restaurantName ?? ""}`;
    if (!map.has(key)) {
      map.set(key, { dishName: item.dishName, restaurantName: item.restaurantName, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values());
}

function sortAlphabetically(items: UnifiedItem[]): UnifiedItem[] {
  return items
    .filter((item): item is UnifiedItem => item != null)
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

// ─── GroceryScreen ─────────────────────────────────────────

export function GroceryScreen() {
  const [localItems, setLocalItems] = useState<GroceryItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  // Supabase hooks
  const { data: supabaseData } = useGroceryItems();
  const checkMutation = useCheckGroceryItem();
  const deleteMutation = useDeleteGroceryItem();
  const clearCheckedMutation = useClearChecked();

  // Determine whether Supabase data should be used:
  // Only use Supabase items if the query returned a non-empty array.
  // An empty Supabase result defers to localStorage (Supabase might not be configured).
  const hasSupabaseData = Array.isArray(supabaseData) && supabaseData.length > 0;

  const refreshLocal = useCallback(() => {
    setLocalItems(readGroceryList());
  }, []);

  // Load view mode preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      if (saved === "flat" || saved === "grouped") {
        setViewMode(saved as ViewMode);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshLocal();
    window.addEventListener("plately:grocery-updated", refreshLocal);
    window.addEventListener("storage", refreshLocal);
    return () => {
      window.removeEventListener("plately:grocery-updated", refreshLocal);
      window.removeEventListener("storage", refreshLocal);
    };
  }, [refreshLocal]);

  const toggleViewMode = () => {
    const next: ViewMode = viewMode === "grouped" ? "flat" : "grouped";
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // ignore
    }
  };

  // Build the unified item list
  const items: UnifiedItem[] = hasSupabaseData
    ? (supabaseData ?? []).filter(Boolean).map(supabaseToUnified)
    : localItems.filter(Boolean).map(localToUnified);

  const isEmpty = items.length === 0;
  const hasChecked = items.some((i) => i.checked);
  const groups = groupByDish(items);
  const flatItems = sortAlphabetically(items);

  // ── Action handlers ──────────────────────────────────────

  const handleToggle = (item: UnifiedItem) => {
    if (item.isSupabase) {
      checkMutation.mutate({ id: item.id, checked: !item.checked });
    } else {
      toggleGroceryItem(item.id);
      refreshLocal();
    }
  };

  const handleRemove = (item: UnifiedItem) => {
    if (item.isSupabase) {
      deleteMutation.mutate(item.id);
    } else {
      removeGroceryItem(item.id);
      refreshLocal();
    }
  };

  const handleClearChecked = () => {
    if (hasSupabaseData) {
      clearCheckedMutation.mutate();
    } else {
      clearCheckedItems();
      refreshLocal();
    }
  };

  const handleClearAll = () => {
    // Clear all is always local-only for now; Supabase doesn't have a "clear all" mutation
    // so we fall back to deleting each item individually via the Supabase mutation when active.
    if (hasSupabaseData) {
      items.forEach((item) => deleteMutation.mutate(item.id));
    } else {
      clearGroceryList();
      refreshLocal();
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="px-5 pt-[calc(var(--space-safe-top)+20px)] pb-4 flex items-end justify-between">
        <div className="flex items-center gap-2">
          <motion.h1
            className="text-[1.75rem] tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            Grocery List
          </motion.h1>
          {/* Sync indicator — shown when Supabase data is active */}
          {hasSupabaseData && (
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.25 }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                background: "var(--color-accent-light)",
                color: "var(--color-accent)",
                alignSelf: "center",
                marginBottom: 2,
              }}
              aria-label="Grocery list is synced"
              title="Synced with your account"
            >
              <CloudIcon />
              Synced
            </motion.span>
          )}
        </div>

        {!isEmpty && (
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {/* View toggle */}
            <button
              onClick={toggleViewMode}
              aria-label={viewMode === "grouped" ? "Switch to flat view" : "Switch to grouped view"}
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] transition-colors"
              style={{
                background: "var(--color-surface-raised)",
                color: viewMode === "flat" ? "var(--color-accent)" : "var(--color-text-tertiary)",
                border: "1px solid var(--color-card-border)",
              }}
            >
              {viewMode === "grouped" ? <FlatViewIcon /> : <GroupedViewIcon />}
            </button>

            {hasChecked && (
              <button
                onClick={handleClearChecked}
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Clear done
              </button>
            )}
            <button
              onClick={handleClearAll}
              className="text-[13px] font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              Clear all
            </button>
          </motion.div>
        )}
      </div>

      {/* Content */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
          <EmptyState />
        </div>
      ) : viewMode === "flat" ? (
        /* ── Flat view ── */
        <div className="flex-1 px-4 pb-8">
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <FrostedCard noPadding className="overflow-hidden">
              <AnimatePresence mode="popLayout">
                {flatItems.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                    transition={{ duration: 0.18 }}
                  >
                    <SwipeableGroceryRow
                      item={item}
                      isLast={idx === flatItems.length - 1}
                      onToggle={() => handleToggle(item)}
                      onRemove={() => handleRemove(item)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </FrostedCard>
          </motion.div>
        </div>
      ) : (
        /* ── Grouped view ── */
        <div className="flex-1 px-4 flex flex-col gap-5 pb-8">
          <AnimatePresence mode="popLayout">
            {groups.map((group) => (
              <DishGroupSection
                key={`${group.dishName}::${group.restaurantName}`}
                group={group}
                onToggle={(item) => handleToggle(item)}
                onRemove={(item) => handleRemove(item)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Dish group section ─────────────────────────────────────

function DishGroupSection({
  group,
  onToggle,
  onRemove,
}: {
  group: DishGroup;
  onToggle: (item: UnifiedItem) => void;
  onRemove: (item: UnifiedItem) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
    >
      {/* Section label */}
      <div className="mb-2 px-1">
        <p
          className="text-xs font-semibold uppercase tracking-widest truncate"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {group.dishName}
        </p>
        {group.restaurantName && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--color-text-tertiary)", opacity: 0.75 }}>
            {group.restaurantName}
          </p>
        )}
      </div>

      {/* Items */}
      <FrostedCard noPadding className="overflow-hidden">
        <AnimatePresence mode="popLayout">
          {group.items.map((item, idx) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0, overflow: "hidden" }}
              transition={{ duration: 0.18 }}
            >
              <SwipeableGroceryRow
                item={item}
                isLast={idx === group.items.length - 1}
                onToggle={() => onToggle(item)}
                onRemove={() => onRemove(item)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </FrostedCard>
    </motion.div>
  );
}

// ─── Swipeable grocery row ─────────────────────────────────

const REVEAL_THRESHOLD = 40;   // px left to reveal delete button
const AUTO_DELETE_THRESHOLD = 80;  // px left to auto-delete on release

function SwipeableGroceryRow({
  item,
  isLast,
  onToggle,
  onRemove,
}: {
  item: UnifiedItem;
  isLast: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;

    if (delta >= AUTO_DELETE_THRESHOLD) {
      onRemove();
    } else if (delta >= REVEAL_THRESHOLD) {
      setRevealed(true);
    } else if (delta <= -20) {
      setRevealed(false);
    }
  };

  return (
    <div
      className="grocery-row-container"
      style={{ position: "relative", overflow: "hidden" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => { if (revealed) setRevealed(false); }}
    >
      {/* Delete action behind row */}
      <div
        aria-hidden={!revealed}
        className="grocery-row-delete-bg"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 72,
          background: "var(--color-error)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: revealed ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: revealed ? "auto" : "none",
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Delete ${item.name}`}
          tabIndex={revealed ? 0 : -1}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: "8px" }}
        >
          <TrashIcon />
        </button>
      </div>

      {/* Main row */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-transparent"
        style={{
          borderBottom: isLast ? undefined : "1px solid rgba(180,170,158,0.15)",
          transform: revealed ? "translateX(-72px)" : "translateX(0)",
          transition: "transform 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Checkbox */}
        <button
          onClick={onToggle}
          aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
          className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors"
          style={{
            border: item.checked ? "none" : "1.75px solid rgba(180,170,158,0.55)",
            background: item.checked ? "var(--color-accent)" : "transparent",
          }}
        >
          {item.checked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12l5 5L20 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Name + quantity */}
        <div className="flex-1 min-w-0">
          <span
            className="text-sm"
            style={{
              color: item.checked ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
              textDecoration: item.checked ? "line-through" : "none",
              transition: "color 0.2s, text-decoration 0.2s",
            }}
          >
            {item.name}
          </span>
          {(item.quantity || item.unit) && (
            <span className="text-xs ml-1.5" style={{ color: "var(--color-text-tertiary)" }}>
              {[item.quantity, item.unit].filter(Boolean).join(" ")}
            </span>
          )}
        </div>

        {/* Remove button (always visible — X button) */}
        <button
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-xs"
    >
      <FrostedCard elevated className="flex flex-col items-center gap-3 py-8 px-6 text-center">
        <BagIllustration />
        <div>
          <h2
            className="text-base mb-1"
            style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
          >
            Your list is empty
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Open any saved recipe and tap{" "}
            <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>Add to Grocery List</span>{" "}
            to start your shop.
          </p>
        </div>
      </FrostedCard>
    </motion.div>
  );
}

// ─── Icons ──────────────────────────────────────────────────

function CloudIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlatViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GroupedViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function BagIllustration() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <rect x="8" y="18" width="40" height="30" rx="6" fill="rgba(196, 98, 45, 0.08)" stroke="rgba(196, 98, 45, 0.18)" strokeWidth="1.5" />
      <path d="M20 18v-4a8 8 0 0 1 16 0v4" stroke="rgba(196, 98, 45, 0.4)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 32l3 3 7-8" stroke="rgba(61, 125, 94, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
