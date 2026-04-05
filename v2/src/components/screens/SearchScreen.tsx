"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";

export function SearchScreen() {
  const [query, setQuery] = useState("");

  return (
    <div className="min-h-full flex flex-col px-4">
      {/* Header */}
      <div className="pt-[calc(var(--space-safe-top)+20px)] pb-4">
        <motion.h1
          className="text-[1.75rem] tracking-[-0.02em] mb-4"
          style={{ fontFamily: "var(--font-display), Georgia, serif", color: "var(--color-text-primary)" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          Find a Restaurant
        </motion.h1>

        {/* Search input */}
        <FrostedCard noPadding className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 h-[52px]">
            <SearchInputIcon />
            <input
              type="search"
              placeholder="Restaurant name or address…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--color-text-tertiary)]"
              style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-body), system-ui, sans-serif" }}
              aria-label="Search restaurants"
            />
          </div>
        </FrostedCard>
      </div>

      {/* Empty / results area */}
      {query.length === 0 && (
        <motion.p
          className="text-sm text-center pt-12"
          style={{ color: "var(--color-text-tertiary)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Search for a place you've visited
        </motion.p>
      )}
    </div>
  );
}

function SearchInputIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="var(--color-text-tertiary)" strokeWidth="1.75" />
      <path d="M16.5 16.5L21 21" stroke="var(--color-text-tertiary)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
