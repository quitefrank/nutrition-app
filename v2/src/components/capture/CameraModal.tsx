"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { compressImage } from "@/lib/imageUtils";
import { InferenceState, type ScanResult } from "@/components/scan/InferenceState";
import { retakeMergeAndSave } from "@/lib/retakeMergeAndSave";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";


interface CameraModalProps {
  /** Whether the modal is open. Defaults to true (for retake mode, control via conditional render). */
  open?: boolean;
  onClose: () => void;
  onProcessingStart?: (message: string) => void;
  onProcessingComplete?: (scanKey: string) => void;
  onProcessingError?: (message: string) => void;
  /** 'scan' — normal first-time capture; 'retake' — merge scan. Defaults to 'scan'. */
  mode?: 'scan' | 'retake';
  /** Provided in retake mode: Supabase restaurantId to merge into */
  restaurantId?: string | null;
  /** Provided in retake mode: already-captured dish names (lowercase trimmed) */
  existingDishNames?: string[];
  /** Provided in retake mode: original totalDetected count for context header */
  totalDetected?: number;
  /** Provided in retake mode: called with count of newly added recipes after merge */
  onRetakeMerged?: (newRecipeCount: number) => void;
  /** Restaurant name for the retake context header */
  restaurantName?: string | null;
  /** Google Places ID for the restaurant — used in retake mode to write sessionStorage entry */
  placeId?: string | null;
}

type PermissionPhase =
  /** Initial state — haven't checked or requested yet */
  | "unknown"
  /** Permission was explicitly denied by the browser */
  | "denied"
  /** Prompt phase — show value-framing overlay before asking */
  | "value-framing"
  /** Camera is active */
  | "granted";

/** Query the Permissions API without triggering a prompt */
async function checkCameraPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state as "granted" | "denied" | "prompt";
  } catch {
    return "unknown";
  }
}

/** Low-confidence threshold: scores below this percentage trigger InferenceState */
const CONFIDENCE_THRESHOLD = 70;

/** Prefix for sessionStorage keys — architecture contract ARCH13 (see planning/architecture.md) */
const SCAN_KEY_PREFIX = "plately:scan:";

/** Minimum downward drag distance (px) to dismiss the modal with a swipe */
const SWIPE_DISMISS_THRESHOLD_PX = 80;

export function CameraModal({
  open = true,
  onClose,
  onProcessingStart,
  onProcessingComplete,
  onProcessingError,
  mode = 'scan',
  restaurantId,
  existingDishNames,
  totalDetected,
  onRetakeMerged,
  restaurantName,
  placeId,
}: CameraModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // D5: AbortController to cancel in-flight /api/scan requests when the modal closes.
  const abortControllerRef = useRef<AbortController | null>(null);

  const [permissionPhase, setPermissionPhase] = useState<PermissionPhase>("unknown");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Swipe-down dismiss tracking
  const [dragStartY, setDragStartY] = useState<number | null>(null);

  // Corner brackets fade out 2 seconds after the camera view is live
  const [bracketsVisible, setBracketsVisible] = useState(true);

  // Low-confidence result pending user confirmation
  const [pendingResult, setPendingResult] = useState<{
    result: ScanResult;
    confidence: number;
    scanKey: string;
  } | null>(null);

  // Inline scan error shown inside the camera frame (AC1 — Story 6.5)
  const [scanError, setScanError] = useState<string | null>(null);

  // True while a scan request is in-flight — shows a loading indicator inside the camera frame.
  const [isScanning, setIsScanning] = useState(false);

  // Holds the dish→recipe map promise across the confidence gate confirm flow

  const springTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: "spring" as const, damping: 28, stiffness: 340 };

  // ─── Camera lifecycle ─────────────────────────────────────────────────────

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
      }
      setCameraReady(true);
      setPermissionPhase("granted");

      // Reset bracket visibility whenever a new camera session starts
      setBracketsVisible(true);
    } catch {
      const cameraFailMsg = "Camera unavailable — try uploading a photo instead.";
      setCameraError(cameraFailMsg);
      setCameraReady(false);
      setPermissionPhase("denied");
      onProcessingError?.(cameraFailMsg);
    }
  }, [onProcessingError]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    // D5: Cancel any in-flight scan request to avoid orphaned side-effects.
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  // ─── Permission check on open ─────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    // Reset state whenever the modal opens
    setBracketsVisible(true);
    setPendingResult(null);
    setScanError(null);
    setIsScanning(false);

    async function init() {
      const perm = await checkCameraPermission();

      if (perm === "denied") {
        setPermissionPhase("denied");
        return;
      }

      if (perm === "prompt") {
        // Show value-framing overlay — don't request the permission yet
        setPermissionPhase("value-framing");
        return;
      }

      // "granted" or "unknown" — attempt to start directly
      await startCamera();
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── plately:supabase-saved listener ──────────────────────────────────────
  // When autoSaveToSupabase completes, it dispatches this event with the real
  // Supabase recipe UUID. We update the sessionStorage entry so the recipe page
  // can redirect to the UUID-based URL path.

  useEffect(() => {
    function handleSupabaseSaved(e: Event) {
      const { scanKey, recipeId } = (e as CustomEvent<{ scanKey: string; recipeId: string }>).detail;
      try {
        const raw = sessionStorage.getItem(scanKey);
        if (!raw) return;
        const stored = JSON.parse(raw) as Record<string, unknown>;
        sessionStorage.setItem(scanKey, JSON.stringify({ ...stored, supabaseRecipeId: recipeId }));
      } catch {
        // Non-critical — session storage update is best-effort
      }
    }

    window.addEventListener("plately:supabase-saved", handleSupabaseSaved);
    return () => window.removeEventListener("plately:supabase-saved", handleSupabaseSaved);
  }, []);

  // ─── Stop camera on close ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      stopCamera();
      setDragStartY(null);
    }
  }, [open, stopCamera]);

  // ─── Corner bracket fade-out ──────────────────────────────────────────────
  // Starts counting from when the camera view becomes ready.

  useEffect(() => {
    if (!cameraReady) return;
    const timer = setTimeout(() => setBracketsVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [cameraReady]);

  // ─── Capture ──────────────────────────────────────────────────────────────

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !cameraReady) return;

    // D4: Guard against drawing to a zero-size canvas (video not yet decoded).
    const width = videoRef.current.videoWidth;
    const height = videoRef.current.videoHeight;
    if (!width || !height) {
      console.warn('[CameraModal] capturePhoto: video not ready (0×0)');
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(videoRef.current, 0, 0);

    const rawBlob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.9)
    );

    await submitImage(rawBlob);
  }, [cameraReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── File upload ──────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so the same file can be re-selected after a retake
      e.target.value = "";
      await submitImage(file);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ─── Submit (shared by capture and upload) ────────────────────────────────

  async function submitImage(image: Blob | File) {
    stopCamera();
    setIsScanning(true);
    onProcessingStart?.("Identifying your dish…");

    try {
      // 1. Compress before upload — keeps payload under Vercel's 4.5 MB body limit.
      //    Raw HEIC/PNG from phones can reach 4–8 MB before compression.
      const compressed = await compressImage(image, { maxWidth: 1920, quality: 0.85 });

      // 2. Encode to base64 via FileReader (avoids stack overflow on large blobs)
      const mimeType = "image/jpeg";
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });

      // BYOAK: attach user-provided Gemini key if present (SSR-safe guard)
      const scanHeaders: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const userKey = typeof localStorage !== "undefined"
          ? (localStorage.getItem("plately_user_gemini_key") ?? "")
          : "";
        if (userKey) scanHeaders["X-User-Gemini-Key"] = userKey;
      } catch {
        // localStorage unavailable — proceed without user key
      }

      // D5: Cancel any previous in-flight scan and register a new controller.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: scanHeaders,
        body: JSON.stringify({ imageBase64: base64, mimeType }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } | string | null };
        const msg =
          err.error !== null && typeof err.error === "object"
            ? err.error?.message
            : typeof err.error === "string"
              ? err.error
              : undefined;
        throw new Error(msg ?? "Scan failed");
      }

      const { data } = await res.json() as { data: {
        type: "menu" | "dish";
        restaurantName: string | null;
        dishes: Array<{
          id?: string;
          name: string;
          description?: string;
          confidence?: number;
          [key: string]: unknown;
        }>;
        totalDetected?: number;
      } };

      const firstDish = data?.dishes?.[0];
      if (!firstDish) throw new Error("No dish identified");

      // 3. Store initial Gemini-only result immediately
      const scanKey = `${SCAN_KEY_PREFIX}${crypto.randomUUID()}`;
      const initialResult: ScanResult = {
        type: data.type,
        restaurantName: data.restaurantName ?? null,
        allDishes: data.dishes,
        enriched: false,
        // totalDetected is the raw Gemini dish count (includes empty-name entries that were
        // filtered server-side). RestaurantScreen uses this to show ScanConfidenceBanner.
        totalDetected: data.totalDetected,
      };
      try {
        sessionStorage.setItem(scanKey, JSON.stringify(initialResult));
      } catch {
        // sessionStorage write is best-effort
      }

      // 4. Confidence gate — per-dish confidence from Gemini is 0–1; convert to 0–100.
      //    If no confidence field is present, treat as high confidence (proceed normally).
      const rawConfidence = firstDish.confidence;
      const confidencePct =
        typeof rawConfidence === "number"
          ? Math.round(rawConfidence * 100)
          : 100;

      if (confidencePct < CONFIDENCE_THRESHOLD) {
        // Pause processing flow and ask the user to confirm.
        setIsScanning(false);
        setPendingResult({ result: initialResult, confidence: confidencePct, scanKey });
        return;
      }

      // High confidence — proceed
      setIsScanning(false);
      await handlePostScan(data.dishes, data.restaurantName, scanKey, initialResult);
    } catch (err) {
      setIsScanning(false);
      // D5: Scan was cancelled because the modal closed — not a user-visible error.
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error("[CameraModal] scan error:", err);
      const msg = err instanceof Error ? err.message : "Couldn't identify the dish — tap to try again.";
      // AC1 (Story 6.5): Gemini scan failures show inline — do NOT call onProcessingError.
      // onProcessingError is reserved for hardware camera errors (cameraError path).
      setScanError(msg);
    }
  }

  // ─── Post-scan branching: retake vs normal ─────────────────────────────────

  async function handlePostScan(
    dishes: ScanResult["allDishes"],
    scannedRestaurantName: string | null,
    scanKey: string,
    initialResult: ScanResult,
  ) {
    if (mode === 'retake' && restaurantId) {
      // Retake path: merge new dishes without duplicating existing ones
      try {
        const newCount = await retakeMergeAndSave({
          restaurantId,
          newDishes: dishes,
          existingDishNames: existingDishNames ?? [],
          queryClient,
        });
        // P1: Write a new plately_scan_* sessionStorage entry so RestaurantScreen can
        // pick up the new dishes via loadRecipesForRestaurant / loadTotalDetected.
        if (placeId) {
          const now = Date.now();
          const retryScanKey = `plately_scan_${now}`;
          try {
            sessionStorage.setItem(retryScanKey, JSON.stringify({
              type: 'menu' as const,
              restaurantName: restaurantName ?? null,
              restaurantPlaceId: placeId,
              allDishes: dishes,
              enriched: false,
              totalDetected: dishes.length,
              scannedAt: now,
            }));
          } catch {
            // sessionStorage write is best-effort
          }
        }
        onRetakeMerged?.(newCount);
      } catch (err) {
        // P8: Signal the error to the parent before calling onRetakeMerged so the
        // parent can show an error state instead of silently resetting.
        console.warn('[CameraModal] retakeMergeAndSave failed:', err instanceof Error ? err.message : err);
        onProcessingError?.(err instanceof Error ? err.message : 'Retake failed');
        onRetakeMerged?.(0);
      }
    } else if (mode === 'retake' && !restaurantId) {
      // Retake fallback: restaurantId not yet available — use normal autoSave
      console.warn('[CameraModal] retake mode but restaurantId is null — falling back to autoSaveToSupabase');
      void autoSaveToSupabase(scanKey);
      fireEnrichment(dishes, restaurantName, scanKey, initialResult);
      // P2: Call onRetakeMerged so the modal doesn't get stuck waiting for a callback.
      onRetakeMerged?.(0);
    } else {
      // Normal (first-time) scan path
      onProcessingComplete?.(scanKey);
      fireEnrichment(dishes, scannedRestaurantName, scanKey, initialResult);
    }
  }

  // ─── Confidence gate callbacks ────────────────────────────────────────────

  function handleInferenceConfirm() {
    if (!pendingResult) return;
    const { scanKey, result } = pendingResult;
    setPendingResult(null);
    // P3: Catch errors from handlePostScan and surface them to the user rather
    // than swallowing them with a bare void.
    handlePostScan(result.allDishes, result.restaurantName, scanKey, result).catch((err) => {
      console.error('[CameraModal] handleInferenceConfirm error:', err);
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    });
  }

  function handleInferenceRetake() {
    setPendingResult(null);
    // Reset camera state and restart
    setCameraError(null);
    setBracketsVisible(true);
    startCamera();
  }

  // ─── Scan error retry (AC1 — Story 6.5) ──────────────────────────────────

  function handleScanRetry() {
    setScanError(null);
    setBracketsVisible(true);
    startCamera();
  }

  // ─── Fire-and-forget enrichment ───────────────────────────────────────────

  function fireEnrichment(
    dishes: ScanResult["allDishes"],
    restaurantName: string | null,
    scanKey: string,
    initialResult: ScanResult,
  ) {
    void (async () => {
      try {
        const enrichRes = await fetch("/api/scan/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dishes: dishes.map((d) => ({
              id: d.id,
              name: d.name,
              description: typeof d.description === "string" ? d.description : "",
            })),
            restaurantName: restaurantName ?? null,
          }),
        });

        if (!enrichRes.ok) {
          const errBody = await enrichRes.json().catch(() => ({}));
          console.error("[CameraModal] enrich API returned", enrichRes.status, errBody);
          return;
        }

        const enrichData = await enrichRes.json() as {
          data?: {
            dishes: Array<{
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
          };
        };

        const enrichedDishes = enrichData?.data?.dishes;
        if (!Array.isArray(enrichedDishes)) {
          console.error("[CameraModal] enrichedDishes is not an array:", enrichedDishes);
          return;
        }

        const stored = sessionStorage.getItem(scanKey);
        const storedResult: ScanResult = stored ? JSON.parse(stored) as ScanResult : initialResult;

        const mergedDishes = storedResult.allDishes.map((dish) => {
          const enriched = enrichedDishes.find((e) =>
            e.id ? e.id === dish.id : e.name === dish.name
          );
          if (!enriched) return dish;
          return { ...dish, ...enriched };
        });

        sessionStorage.setItem(
          scanKey,
          JSON.stringify({ ...storedResult, allDishes: mergedDishes, enriched: true })
        );

        window.dispatchEvent(new CustomEvent("plately:enriched", { detail: { key: scanKey } }));
      } catch (err) {
        console.warn(
          "[CameraModal] enrichment failed (non-blocking):",
          err instanceof Error ? err.message : err
        );
      }
    })();
  }

  // ─── Close ────────────────────────────────────────────────────────────────

  const handleClose = () => {
    stopCamera();
    setScanError(null);
    onClose();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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
          onPointerDown={(e) => {
            if (pendingResult) return;
            const target = e.target as HTMLElement;
            if (target.closest("button, input, [data-no-swipe]")) return;
            setDragStartY(e.clientY);
          }}
          onPointerUp={(e) => {
            // P9: Guard against stale dragStartY if pendingResult appeared mid-drag
            if (pendingResult) { setDragStartY(null); return; }
            if (dragStartY !== null && e.clientY - dragStartY > SWIPE_DISMISS_THRESHOLD_PX) {
              handleClose();
            }
            setDragStartY(null);
          }}
          onPointerCancel={() => setDragStartY(null)}
        >
          {/* Camera viewfinder */}
          <div className="relative flex-1 overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              aria-hidden="true"
            />

            {/* Corner brackets — fade out 2 s after camera is live */}
            {cameraReady && (
              <motion.div
                animate={{ opacity: bracketsVisible ? 1 : 0 }}
                transition={
                  bracketsVisible
                    ? { duration: 0 }
                    : { duration: 0.5, ease: "easeOut" }
                }
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <ScanFrame />
              </motion.div>
            )}

            {/* ── Retake context header ─────────────────────────────── */}
            {mode === 'retake' && existingDishNames !== undefined && totalDetected !== undefined && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: 'absolute',
                  top: 'calc(var(--space-safe-top, 0px) + 16px)',
                  left: 20,
                  right: 20,
                  zIndex: 20,
                  borderRadius: 12,
                  background: 'rgba(13,11,9,0.72)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  padding: '10px 16px',
                  textAlign: 'center',
                }}
              >
                <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>
                  {existingDishNames.length} dish{existingDishNames.length !== 1 ? 'es' : ''} captured
                </p>
                <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, margin: '2px 0 0' }}>
                  Scan the menu to read the remaining {Math.max(0, totalDetected - existingDishNames.length)}
                </p>
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <p className="text-center text-white/70 text-sm">{cameraError}</p>
              </div>
            )}

            {/* ── Value-framing permission overlay ─────────────────────── */}
            <AnimatePresence>
              {permissionPhase === "value-framing" && (
                <motion.div
                  key="value-framing"
                  data-testid="value-framing"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                  transition={springTransition}
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 30,
                    background: "rgba(13, 11, 9, 0.80)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "32px",
                  }}
                >
                  <FrostedCard elevated className="w-full max-w-sm" style={{ padding: "32px 24px 28px" }}>
                    {/* Camera icon */}
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }} aria-hidden="true">
                      <svg
                        width="52"
                        height="52"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                        <path d="M16 3H8L5 7h14l-3-4z" />
                        <circle cx="12" cy="14" r="3" />
                      </svg>
                    </div>

                    {/* Headline */}
                    <h2
                      style={{
                        fontFamily: "var(--font-display), Georgia, serif",
                        fontSize: "1.25rem",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        textAlign: "center",
                        marginBottom: "10px",
                        lineHeight: 1.3,
                      }}
                    >
                      See what&apos;s in your dish
                    </h2>

                    {/* Explanation */}
                    <p
                      style={{
                        fontSize: "0.9375rem",
                        color: "var(--color-text-secondary)",
                        textAlign: "center",
                        lineHeight: 1.55,
                        marginBottom: "28px",
                      }}
                    >
                      We&apos;ll scan the menu or plate to identify ingredients and nutrition — so you can take the recipe home.
                    </p>

                    {/* Allow camera */}
                    <button
                      onClick={startCamera}
                      aria-label="Allow camera access"
                      className="btn-pill btn-primary w-full"
                      style={{ marginBottom: "12px" }}
                    >
                      Allow Camera
                    </button>

                    {/* Upload fallback */}
                    <button
                      onClick={() => {
                        setPermissionPhase("denied");
                        fileInputRef.current?.click();
                      }}
                      aria-label="Upload a photo instead"
                      className="btn-pill btn-ghost w-full"
                      style={{ fontSize: "0.875rem" }}
                    >
                      Upload a photo instead
                    </button>
                  </FrostedCard>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Denied state ──────────────────────────────────────────── */}
            {permissionPhase === "denied" && !cameraError && (
              <div
                data-testid="denied-state"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 25,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px",
                }}
              >
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "rgba(255,255,255,0.65)",
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  Camera access was denied. You can still scan using a photo from your camera roll.
                </p>
              </div>
            )}

            {/* ── Low-confidence overlay ────────────────────────────────── */}
            <AnimatePresence>
              {pendingResult && (
                <InferenceState
                  key="inference-state"
                  result={pendingResult.result}
                  confidence={pendingResult.confidence}
                  onConfirm={handleInferenceConfirm}
                  onRetake={handleInferenceRetake}
                />
              )}
            </AnimatePresence>

            {/* ── Scanning indicator (in-flight) ───────────────────────── */}
            <AnimatePresence>
              {isScanning && !scanError && !pendingResult && (
                <ScanningIndicator key="scanning" />
              )}
            </AnimatePresence>

            {/* ── Scan error overlay (AC1 — Story 6.5) ─────────────────── */}
            <AnimatePresence>
              {scanError && (
                <ScanErrorOverlay
                  key={`scan-error-${scanError ?? ''}`}
                  message={scanError}
                  onRetry={handleScanRetry}
                />
              )}
            </AnimatePresence>

            {/* Dismiss button */}
            <button
              onClick={handleClose}
              aria-label="Close camera"
              className="absolute top-4 right-4 flex items-center justify-center w-11 h-11 rounded-full"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)", zIndex: 35 }}
            >
              <XIcon />
            </button>

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload photo from library"
              className="absolute top-4 left-4 flex items-center justify-center w-11 h-11 rounded-full"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)", zIndex: 35 }}
            >
              <UploadIcon />
            </button>
          </div>

          {/* ── Capture bar ─────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-center"
            style={{
              paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 32px)`,
              paddingTop: 24,
            }}
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
                style={{
                  background: cameraReady ? "var(--color-accent)" : "rgba(255,255,255,0.4)",
                }}
              />
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload image file"
            className="sr-only"
            onChange={handleFileUpload}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── ScanningIndicator ────────────────────────────────────────────────────────
// Shown inside the camera frame while a scan request is in-flight.

function ScanningIndicator() {
  return (
    <motion.div
      data-testid="scanning-indicator"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      }}
    >
      <div
        className="animate-spin"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.2)",
          borderTopColor: "rgba(255,255,255,0.9)",
        }}
        aria-hidden="true"
      />
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.875rem" }}>
        Identifying your dish…
      </p>
    </motion.div>
  );
}

// ─── ScanErrorOverlay (AC1 — Story 6.5) ──────────────────────────────────────
// Shown inline inside the camera frame when a Gemini scan fails.
// Dusty rose tint + "Try again" retry button. Modal stays open.

interface ScanErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

function ScanErrorOverlay({ message, onRetry }: ScanErrorOverlayProps) {
  return (
    <motion.div
      data-testid="scan-error-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        // Dusty rose tint — Story 6.5 AC1
        background: "rgba(188, 108, 110, 0.22)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        gap: "20px",
      }}
    >
      <p
        style={{
          fontSize: "0.9375rem",
          color: "rgba(255,255,255,0.9)",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 260,
        }}
      >
        {message}
      </p>
      <button
        onClick={onRetry}
        aria-label="Retry scan"
        className="btn-pill btn-primary"
        style={{ minWidth: 120 }}
      >
        Try again
      </button>
    </motion.div>
  );
}

/** Corner-bracket scan frame rendered as an SVG */
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
      <path
        d={`M${corner} 4 L4 4 L4 ${corner}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Top-right */}
      <path
        d={`M${size - corner} 4 L${size - 4} 4 L${size - 4} ${corner}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Bottom-left */}
      <path
        d={`M4 ${size - corner} L4 ${size - 4} L${corner} ${size - 4}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Bottom-right */}
      <path
        d={`M${size - 4} ${size - corner} L${size - 4} ${size - 4} L${size - corner} ${size - 4}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
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
