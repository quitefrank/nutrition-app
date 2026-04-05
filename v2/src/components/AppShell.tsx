"use client";

import { useState } from "react";
import { AtmosphericBackground } from "@/components/ui/AtmosphericBackground";
import { TabBar } from "@/components/layout/TabBar";
import { ProcessingStrip, ProcessingState } from "@/components/layout/ProcessingStrip";
import { CameraModal } from "@/components/capture/CameraModal";

interface AppShellProps {
  children: React.ReactNode;
  /** Current atmospheric background image URL (from active recipe/restaurant) */
  atmosphericImageUrl?: string | null;
}

export function AppShell({ children, atmosphericImageUrl }: AppShellProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [processingMessage, setProcessingMessage] = useState<string | undefined>();
  const [resultId, setResultId] = useState<string | undefined>();

  return (
    <div className="relative h-full">
      {/* Layer 0: Atmospheric background */}
      <AtmosphericBackground imageUrl={atmosphericImageUrl} />

      {/* Layer 1: Page content */}
      <div className="relative z-10 h-full scroll-content">{children}</div>

      {/* Layer 2: Tab bar with embedded camera FAB */}
      <TabBar onCameraPress={() => setCameraOpen(true)} />

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
