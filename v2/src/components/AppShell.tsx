"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtmosphericBackground } from "@/components/ui/AtmosphericBackground";
import { TabBar } from "@/components/layout/TabBar";
import { ProcessingStrip, ProcessingState } from "@/components/layout/ProcessingStrip";
import { CameraModal } from "@/components/capture/CameraModal";
import { ScanConfirmationOverlay } from "@/components/scan/ScanConfirmationOverlay";
import { CameraContext } from "@/contexts/CameraContext";

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
  const [mounted, setMounted] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [processingMessage, setProcessingMessage] = useState<string | undefined>();
  const [resultId, setResultId] = useState<string | undefined>();
  // scanKey set when a scan completes and is awaiting restaurant confirmation
  const [confirmingScanKey, setConfirmingScanKey] = useState<string | null>(null);

  // Offline detection — navigator.onLine is synchronously available in browser
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // openCamera respects the "no second scan while confirming" guard already used by TabBar
  const openCamera = () => { if (!confirmingScanKey) setCameraOpen(true); };

  return (
    <CameraContext.Provider value={{ openCamera }}>
    <div className="relative h-full">
      {/* Layer 0: Atmospheric background */}
      <AtmosphericBackground imageUrl={atmosphericImageUrl} restaurantId={atmosphericRestaurantId} />

      {/* Layer 1: Page content */}
      <div className="relative z-10 h-full scroll-content">{children}</div>

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
          {/* P2: Prevent a second scan from replacing confirmingScanKey mid-save */}
          <TabBar onCameraPress={openCamera} isOnline={isOnline} />

          {/* Layer 3: Processing strip (above tab bar) */}
          <ProcessingStrip
            state={processingState}
            message={processingMessage}
            resultId={resultId}
            onDismiss={() => setProcessingState("idle")}
          />

          {/* Layer 4: Camera modal */}
          <CameraModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onProcessingStart={(msg) => {
              // Camera stays open during scanning — ScanErrorOverlay handles inline errors.
              // Close on success (onProcessingComplete) or hardware failure (onProcessingError).
              setProcessingState("processing");
              setProcessingMessage(msg);
            }}
            onProcessingComplete={(scanKey) => {
              // Scan succeeded — close camera and enter confirming state.
              setCameraOpen(false);
              // P4: Use "confirming" state — distinct from "processing" (API in-flight)
              setConfirmingScanKey(scanKey);
              setProcessingState("confirming");
              setProcessingMessage(undefined);
            }}
            onProcessingError={(msg) => {
              // Hardware camera errors — close camera and surface error via ProcessingStrip.
              setCameraOpen(false);
              setProcessingState("error");
              setProcessingMessage(msg);
            }}
          />

          {/* Layer 5: Restaurant confirmation overlay (shown after scan, before save) */}
          {confirmingScanKey && (
            <ScanConfirmationOverlay
              scanKey={confirmingScanKey}
              onComplete={(firstRecipeId) => {
                setConfirmingScanKey(null);
                // P6: Null firstRecipeId means save failed — show error rather than
                // a "ready" strip with no navigable result
                if (firstRecipeId) {
                  setProcessingState("ready");
                  setResultId(firstRecipeId);
                } else {
                  setProcessingState("error");
                  setProcessingMessage("Couldn't save your dishes — tap to dismiss");
                }
              }}
              onClose={() => {
                setConfirmingScanKey(null);
                setProcessingState("idle");
              }}
            />
          )}
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
