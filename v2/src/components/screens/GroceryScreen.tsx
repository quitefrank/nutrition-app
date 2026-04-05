"use client";

import { useEffect, useState, useCallback } from "react";
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

// ─── Types ─────────────────────────────────────────────────

interface DishGroup {
  dishName: string;
  restaurantName: string | null;
  items: GroceryItem[];
}

// ─── Helpers ───────────────────────────────────────────────

function groupByDish(items: GroceryItem[]): DishGroup[] {
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

// ─── GroceryScreen ─────────────────────────────────────────

export function GroceryScreen() {
  const [items, setItems] = useState<GroceryItem[]>([]);

  const refresh = useCallback(() => {
    setItems(readGroceryList());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("plately:grocery-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("plately:grocery-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const isEmpty = items.length === 0;
  const hasChecked = items.some((i) => i.checked);
  const groups = groupByDish(items);

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="px-5 pt-[calc(var(--space-safe-top)+20px)] pb-4 flex items-end justify-between">
        <motion.h1
          className="text-[1.75rem] tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          Grocery List
        </motion.h1>

        {!isEmpty && (
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {hasChecked && (
              <button
                onClick={() => { clearCheckedItems(); refresh(); }}
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Clear done
              </button>
            )}
            <button
              onClick={() => { clearGroceryList(); refresh(); }}
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
      ) : (
        <div className="flex-1 px-4 flex flex-col gap-5 pb-8">
          <AnimatePresence mode="popLayout">
            {groups.map((group) => (
              <DishGroupSection
                key={`${group.dishName}::${group.restaurantName}`}
                group={group}
                onToggle={(id) => { toggleGroceryItem(id); refresh(); }}
                onRemove={(id) => { removeGroceryItem(id); refresh(); }}
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
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
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
              <GroceryRow
                item={item}
                isLast={idx === group.items.length - 1}
                onToggle={() => onToggle(item.id)}
                onRemove={() => onRemove(item.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </FrostedCard>
    </motion.div>
  );
}

// ─── Individual grocery row ────────────────────────────────

function GroceryRow({
  item,
  isLast,
  onToggle,
  onRemove,
}: {
  item: GroceryItem;
  isLast: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        borderBottom: isLast ? undefined : "1px solid rgba(180,170,158,0.15)",
      }}
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

      {/* Remove */}
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

function BagIllustration() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <rect x="8" y="18" width="40" height="30" rx="6" fill="rgba(196, 98, 45, 0.08)" stroke="rgba(196, 98, 45, 0.18)" strokeWidth="1.5" />
      <path d="M20 18v-4a8 8 0 0 1 16 0v4" stroke="rgba(196, 98, 45, 0.4)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 32l3 3 7-8" stroke="rgba(61, 125, 94, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
