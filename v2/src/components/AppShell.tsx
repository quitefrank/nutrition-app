"use client";

import { useState, useEffect } from "react";
import { AtmosphericBackground } from "@/components/ui/AtmosphericBackground";
import { TabBar } from "@/components/layout/TabBar";
import { ProcessingStrip, ProcessingState } from "@/components/layout/ProcessingStrip";
import { CameraModal } from "@/components/capture/CameraModal";

interface AppShellProps {
  children: React.ReactNode;
  /** Current atmospheric background image URL (from active recipe/restaurant) */
  atmosphericImageUrl?: string | null;
  /** Restaurant ID for the currently displayed image; when provided the extracted
   *  palette is persisted to Supabase so subsequent renders skip re-extraction. */
  atmosphericRestaurantId?: string;
}

export function AppShell({ children, atmosphericImageUrl, atmosphericRestaurantId }: AppShellProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [processingMessage, setProcessingMessage] = useState<string | undefined>();
  const [resultId, setResultId] = useState<string | undefined>();

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

  return (
    <div className="relative h-full">
      {/* Layer 0: Atmospheric background */}
      <AtmosphericBackground imageUrl={atmosphericImageUrl} restaurantId={atmosphericRestaurantId} />

      {/* Layer 1: Page content */}
      <div className="relative z-10 h-full scroll-content">{children}</div>

      {/* Layer 2: Tab bar with embedded camera FAB */}
      <TabBar onCameraPress={() => setCameraOpen(true)} isOnline={isOnline} />

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
          setCameraOpen(false);
          setProcessingState("processing");
          setProcessingMessage(msg);
        }}
        onProcessingComplete={(id) => {
          setProcessingState("ready");
          setResultId(id);
          setProcessingMessage(undefined);
        }}
        onProcessingError={(msg) => {
          setProcessingState("error");
          setProcessingMessage(msg);
        }}
      />
    </div>
  );
}
