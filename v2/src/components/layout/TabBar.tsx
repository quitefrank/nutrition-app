"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/grocery", label: "Grocery", Icon: GroceryIcon },
  { href: "/import", label: "Import", Icon: ImportIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

interface TabBarProps {
  onCameraPress: () => void;
  /** When false, the camera FAB is visually disabled and tapping is a no-op */
  isOnline?: boolean;
}

// Routes that should keep the Search tab highlighted (restaurants are a leaf of the search flow)
const ACTIVE_PREFIXES: Partial<Record<string, string[]>> = {
  "/search": ["/search", "/restaurants"],
};

export function TabBar({ onCameraPress, isOnline = true }: TabBarProps) {
  const pathname = usePathname();

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
        className="flex flex-1 items-center rounded-full border border-[rgba(180,170,158,0.22)]"
        style={{
          height: 62,
          background: "rgba(255,252,245,0.94)",
          backdropFilter: "blur(32px) saturate(1.5)",
          WebkitBackdropFilter: "blur(32px) saturate(1.5)",
          boxShadow: "0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08)",
        }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : (ACTIVE_PREFIXES[href] ?? [href]).some((p) => pathname.startsWith(p));
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
          aria-label={isOnline ? "Scan or upload a dish" : "Camera unavailable offline"}
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
          whileTap={isOnline ? { scale: 0.88 } : {}}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
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
        "flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-4",
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
        d="M12 3L4 9.5V20h5v-5h6v5h5V9.5L12 3Z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.75}
        fill={filled ? "currentColor" : "none"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="11" cy="11" r="7"
        stroke="currentColor" strokeWidth="1.75"
        fill={filled ? "currentColor" : "none"}
        opacity={filled ? 0.18 : 1}
      />
      {filled && (
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" fill="none" />
      )}
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function GroceryIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 7h12l-1.5 11H7.5L6 7Z"
        stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        opacity={filled ? 0.18 : 1}
      />
      {filled && (
        <path d="M6 7h12l-1.5 11H7.5L6 7Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" fill="none" />
      )}
      <path d="M9 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9.5 12l1.5 2 3-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

function ImportIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12M7 11l5 5 5-5"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        opacity={filled ? 0.18 : 1}
      />
      {filled && (
        <path
          d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          fill="none"
        />
      )}
    </svg>
  );
}

function SettingsIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth={filled ? 2 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill={filled ? "currentColor" : "none"} opacity={filled ? 0.22 : 1} />
      {filled && <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="none" />}
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
