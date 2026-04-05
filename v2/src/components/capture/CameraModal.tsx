"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onProcessingStart: (message: string) => void;
  onProcessingComplete: (recipeId: string) => void;
  onProcessingError: (message: string) => void;
}

type CaptureMode = "camera" | "upload";

export function CameraModal({
  open,
  onClose,
  onProcessingStart,
  onProcessingComplete,
  onProcessingError,
}: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CaptureMode>("camera");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError("Camera unavailable — try uploading a photo instead.");
      setCameraReady(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !cameraReady) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.9)
    );
    await submitImage(blob);
  }, [cameraReady]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await submitImage(file);
    },
    []
  );

  async function submitImage(image: Blob | File) {
    stopCamera();
    onProcessingStart("Identifying your dish…");

    try {
      // Convert to base64 via FileReader — safe for large images (no stack overflow)
      const mimeType = image.type || "image/jpeg";
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(image);
      });

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Scan failed");
      }

      const { data } = await res.json();
      const firstDish = data?.dishes?.[0];
      if (!firstDish) throw new Error("No dish identified");

      // Store initial Gemini-only result immediately
      const scanKey = `plately_scan_${Date.now()}`;
      const initialResult = {
        type: data.type,
        restaurantName: data.restaurantName ?? null,
        allDishes: data.dishes,
        enriched: false,
      };
      sessionStorage.setItem(scanKey, JSON.stringify(initialResult));
      onProcessingComplete(scanKey);

      // Fire-and-forget enrichment — does NOT block the UX
      void (async () => {
        try {
          console.log("[CameraModal] enrichment starting for", scanKey);
          const enrichRes = await fetch("/api/scan/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dishes: data.dishes.map((d: { id?: string; name: string; description?: string }) => ({
                id: d.id,
                name: d.name,
                description: d.description ?? "",
              })),
              restaurantName: data.restaurantName ?? null,
            }),
          });
          if (!enrichRes.ok) {
            const errBody = await enrichRes.json().catch(() => ({}));
            console.error("[CameraModal] enrich API returned", enrichRes.status, errBody);
            return;
          }
          const enrichData = await enrichRes.json();
          console.log("[CameraModal] enrich API response:", JSON.stringify(enrichData).slice(0, 300));
          const enrichedDishes = enrichData?.data?.dishes as Array<{
            id?: string;
            name: string;
            servings: number;
            ingredients: unknown[];
            photoUrl: string | null;
            totalCalories: number | null;
            totalProtein: number | null;
            totalFat: number | null;
            totalCarbs: number | null;
          }>;
          if (!Array.isArray(enrichedDishes)) {
            console.error("[CameraModal] enrichedDishes is not an array:", enrichedDishes);
            return;
          }

          // Merge enriched data back into sessionStorage by dish ID
          const stored = sessionStorage.getItem(scanKey);
          if (!stored) return;
          const storedResult = JSON.parse(stored) as typeof initialResult;

          const mergedDishes = storedResult.allDishes.map((dish: { id?: string; name: string }) => {
            const enriched = enrichedDishes.find((e) => e.id ? e.id === dish.id : e.name === dish.name);
            if (!enriched) return dish;
            return {
              ...dish,
              ingredients: enriched.ingredients,
              servings: enriched.servings,
              photoUrl: enriched.photoUrl,
              totalCalories: enriched.totalCalories,
              totalProtein: enriched.totalProtein,
              totalFat: enriched.totalFat,
              totalCarbs: enriched.totalCarbs,
            };
          });

          sessionStorage.setItem(scanKey, JSON.stringify({
            ...storedResult,
            allDishes: mergedDishes,
            enriched: true,
          }));

          // Notify any listening pages in this tab (recipe page, home screen)
          console.log("[CameraModal] enrichment complete, dispatching plately:enriched for", scanKey);
          window.dispatchEvent(new CustomEvent("plately:enriched", { detail: { key: scanKey } }));
        } catch (err) {
          console.warn("[CameraModal] enrichment failed (non-blocking):", err instanceof Error ? err.message : err);
        }
      })();
    } catch (err) {
      console.error("[CameraModal] scan error:", err);
      onProcessingError("Couldn't identify the dish — tap to try again.");
    }
  }

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Scan or upload a dish"
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "#0D0B09" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            if (open && mode === "camera") startCamera();
          }}
        >
          {/* Camera viewfinder */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              aria-hidden="true"
            />

            {/* Scan frame overlay */}
            {cameraReady && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <ScanFrame />
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <p className="text-center text-white/70 text-sm">{cameraError}</p>
              </div>
            )}

            {/* Dismiss button */}
            <button
              onClick={handleClose}
              aria-label="Close camera"
              className="absolute top-4 right-4 flex items-center justify-center w-11 h-11 rounded-full"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}
            >
              <XIcon />
            </button>

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload photo from library"
              className="absolute top-4 left-4 flex items-center justify-center w-11 h-11 rounded-full"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}
            >
              <UploadIcon />
            </button>
          </div>

          {/* Capture bar */}
          <div
            className="flex items-center justify-center pb-8"
            style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 32px)`, paddingTop: 24 }}
          >
            <button
              onClick={capturePhoto}
              aria-label="Capture photo"
              disabled={!cameraReady}
              className="flex items-center justify-center w-20 h-20 rounded-full"
              style={{
                background: cameraReady ? "#fff" : "rgba(255,255,255,0.3)",
                boxShadow: cameraReady ? "0 0 0 4px rgba(255,255,255,0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <div
                className="w-14 h-14 rounded-full"
                style={{ background: cameraReady ? "var(--color-accent)" : "rgba(255,255,255,0.4)" }}
              />
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileUpload}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ScanFrame() {
  const size = 220;
  const corner = 28;
  const stroke = 3;
  const color = "rgba(255,255,255,0.7)";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
    >
      {/* Top-left */}
      <path d={`M${corner} 4 L4 4 L4 ${corner}`} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      {/* Top-right */}
      <path d={`M${size - corner} 4 L${size - 4} 4 L${size - 4} ${corner}`} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      {/* Bottom-left */}
      <path d={`M4 ${size - corner} L4 ${size - 4} L${corner} ${size - 4}`} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      {/* Bottom-right */}
      <path d={`M${size - 4} ${size - corner} L${size - 4} ${size - 4} L${size - corner} ${size - 4}`} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="white" strokeWidth="1.75" fill="none" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="white" />
      <path d="M3 16l5-5 3 3 3-3 7 7" stroke="white" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
