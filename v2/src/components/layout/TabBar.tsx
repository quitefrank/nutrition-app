"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SPRING_CARD_EXPAND } from "@/lib/springs";

const tabs = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/grocery", label: "Grocery", Icon: GroceryIcon },
  { href: "/recipes", label: "Recipes", Icon: RecipesIcon },
] as const;

interface TabBarProps {
  onCameraPress?: () => void;
  /** When false, the camera FAB is visually disabled and tapping is a no-op */
  isOnline?: boolean;
}

// Routes that should keep the correct tab highlighted
// "/" must list "/restaurants" explicitly — startsWith("//") never matches.
const ACTIVE_PREFIXES: Partial<Record<string, string[]>> = {
  "/": ["/", "/restaurants"],
  "/search": ["/search"],
  "/grocery": ["/grocery"],
  "/recipes": ["/recipes", "/recipe"],
};

export function TabBar({ onCameraPress = () => {}, isOnline = true }: TabBarProps) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-30 flex items-end"
      style={{
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 12px)",
      }}
    >
      {/* Floating glass pill — contains labeled nav tabs */}
      <div
        className="flex flex-1 items-center justify-evenly rounded-full border border-[rgba(180,170,158,0.22)]"
        style={{
          height: 62,
          background: "rgba(255,252,245,0.94)",
          backdropFilter: "blur(32px) saturate(1.5)",
          WebkitBackdropFilter: "blur(32px) saturate(1.5)",
          boxShadow: "0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08)",
        }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const isActive = (ACTIVE_PREFIXES[href] ?? [href]).some((p) =>
            pathname === p || pathname.startsWith(p + "/")
          );
          return (
            <TabItem key={href} href={href} label={label} isActive={isActive}>
              <Icon filled={isActive} />
            </TabItem>
          );
        })}
      </div>

      {/* Gap between pill and camera */}
      <div style={{ width: 12, flexShrink: 0 }} />

      {/* Camera FAB — disabled when offline */}
      <div className="relative flex-shrink-0">
        <motion.button
          onClick={isOnline ? onCameraPress : undefined}
          aria-label={isOnline ? "Scan a menu" : "Camera unavailable — no internet connection"}
          aria-disabled={!isOnline}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 62,
            height: 62,
            background: isOnline ? "var(--color-accent)" : "var(--color-text-disabled)",
            color: "#fff",
            boxShadow: isOnline
              ? "0 0 0 3px rgba(250,242,237,1), 0 4px 14px rgba(196,98,45,0.40)"
              : "0 0 0 3px rgba(250,242,237,1)",
            cursor: isOnline ? "pointer" : "not-allowed",
            opacity: isOnline ? 1 : 0.7,
            transition: "background 0.2s, opacity 0.2s, box-shadow 0.2s",
          }}
          whileTap={isOnline && !reducedMotion ? { scale: 0.88 } : {}}
          transition={reducedMotion ? { duration: 0.15 } : SPRING_CARD_EXPAND}
        >
          <CameraIcon />
        </motion.button>

        {/* Offline indicator dot */}
        {!isOnline && (
          <div
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
            style={{
              background: "var(--color-warning)",
              border: "2px solid rgba(250,242,237,1)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <path d="M5 2v4M5 7.5v.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    </nav>
  );
}

function TabItem({
  href,
  label,
  isActive,
  children,
}: {
  href: string;
  label: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 h-full",
        "transition-colors duration-150",
        isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
      <span
        className="text-[10px] font-medium tracking-wide"
        style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        {label}
      </span>
    </Link>
  );
}

/* ─── Icons ─── */

function HomeIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 21h18M5 21V7l7-4 7 4v14"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"} opacity={filled ? 0.15 : 1}
      />
      {filled && (
        <path d="M3 21h18M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      <rect x="9" y="14" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill={filled ? "currentColor" : "none"} opacity={filled ? 0.3 : 1} />
    </svg>
  );
}

function GroceryIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"
        stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"} opacity={filled ? 0.15 : 1}
      />
      {filled && (
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
      )}
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="11" cy="11" r="7"
        stroke="currentColor" strokeWidth="1.75"
        fill={filled ? "currentColor" : "none"} opacity={filled ? 0.15 : 1}
      />
      {filled && (
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" fill="none" />
      )}
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function RecipesIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21C12 21 4 14.5 4 8.5a4 4 0 0 1 8 0 4 4 0 0 1 8 0C20 14.5 12 21 12 21Z"
        stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"} opacity={filled ? 0.18 : 1}
      />
      {filled && (
        <path d="M12 21C12 21 4 14.5 4 8.5a4 4 0 0 1 8 0 4 4 0 0 1 8 0C20 14.5 12 21 12 21Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
      )}
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 9a2 2 0 0 1 2-2h.5l1.5-3h9l1.5 3H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"
        stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

