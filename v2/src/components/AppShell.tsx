"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AtmosphericBackground } from "@/components/ui/AtmosphericBackground";
import { TabBar } from "@/components/layout/TabBar";
import { ProcessingStrip, ProcessingState } from "@/components/layout/ProcessingStrip";
import { CameraModal } from "@/components/capture/CameraModal";
import { CameraContext } from "@/contexts/CameraContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface AppShellProps {
  children: React.ReactNode;
  /** Current atmospheric background image URL (from active recipe/restaurant) */
  atmosphericImageUrl?: string | null;
  /** Restaurant ID for the currently displayed image; when provided the extracted
   *  palette is persisted to Supabase so subsequent renders skip re-extraction. */
  atmosphericRestaurantId?: string;
}

export function AppShell({ children, atmosphericImageUrl, atmosphericRestaurantId }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [processingMessage, setProcessingMessage] = useState<string | undefined>();

  const isOnline = useOnlineStatus();

  const openCamera = () => { setCameraOpen(true); };

  return (
    <CameraContext.Provider value={{ openCamera }}>
    <div className="relative">
      {/* Layer 0: Atmospheric background */}
      <AtmosphericBackground imageUrl={atmosphericImageUrl} restaurantId={atmosphericRestaurantId} />

      {/* Layer 1: Page content — scroll-content sets height: 100dvh explicitly */}
      <div className="relative z-10 scroll-content">{children}</div>

      {/* Settings icon — persistent top-right, hidden on settings page itself.
          Deferred to client-only to avoid SSR/client pathname mismatch. */}
      {mounted && pathname !== "/settings" && (
        <Link
          href="/settings"
          aria-label="Settings"
          className="fixed z-40 flex items-center justify-center"
          style={{
            top: "calc(var(--space-safe-top, env(safe-area-inset-top, 0px)) + 14px)",
            right: 16,
            width: 44,
            height: 44,
            color: "var(--color-text-tertiary)",
          }}
        >
          <GearIcon />
        </Link>
      )}

      {/* Layers 2-4: client-only — suppressed on SSR to prevent hydration mismatches */}
      {mounted && (
        <>
          {/* Layer 2: Tab bar with embedded camera FAB */}
          <TabBar onCameraPress={openCamera} isOnline={isOnline} />

          {/* Layer 3: Processing strip (above tab bar) — error state only */}
          <ProcessingStrip
            state={processingState}
            message={processingMessage}
            onDismiss={() => setProcessingState("idle")}
          />

          {/* Layer 4: Camera modal */}
          <CameraModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onProcessingStart={(_msg, scanKey) => {
              // Close camera immediately — scan continues in the background.
              // CameraModal's AbortController is guarded by scanInFlightRef so
              // the fetch keeps running after the modal unmounts.
              setCameraOpen(false);
              router.push(`/restaurants/scanning?scanKey=${encodeURIComponent(scanKey)}`);
            }}
            onProcessingComplete={(_scanKey) => {
              // No-op: the scanning page polls sessionStorage directly.
              // Navigation already happened in onProcessingStart.
            }}
            onProcessingError={(msg) => {
              // Hardware camera errors — surface via ProcessingStrip.
              setCameraOpen(false);
              setProcessingState("error");
              setProcessingMessage(msg);
            }}
          />
        </>
      )}
    </div>
    </CameraContext.Provider>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
