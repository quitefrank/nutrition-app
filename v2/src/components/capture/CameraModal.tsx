"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { compressImage } from "@/lib/imageUtils";
import { InferenceState, type ScanResult } from "@/components/scan/InferenceState";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onProcessingStart: (message: string) => void;
  onProcessingComplete: (recipeId: string) => void;
  onProcessingError: (message: string) => void;
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

export function CameraModal({
  open,
  onClose,
  onProcessingStart,
  onProcessingComplete,
  onProcessingError,
}: CameraModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [permissionPhase, setPermissionPhase] = useState<PermissionPhase>("unknown");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Corner brackets fade out 2 seconds after the camera view is live
  const [bracketsVisible, setBracketsVisible] = useState(true);

  // Low-confidence result pending user confirmation
  const [pendingResult, setPendingResult] = useState<{
    result: ScanResult;
    confidence: number;
    scanKey: string;
  } | null>(null);

  // Holds the dish→recipe map promise across the confidence gate confirm flow
  const pendingDishToRecipeMapRef = useRef<Promise<Record<string, string> | null> | null>(null);

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
      setCameraError("Camera unavailable — try uploading a photo instead.");
      setCameraReady(false);
      setPermissionPhase("denied");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  // ─── Permission check on open ─────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    // Reset state whenever the modal opens
    setBracketsVisible(true);
    setPendingResult(null);

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

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
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
    onProcessingStart("Identifying your dish…");

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

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: scanHeaders,
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Scan failed");
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
      } };

      const firstDish = data?.dishes?.[0];
      if (!firstDish) throw new Error("No dish identified");

      // 3. Store initial Gemini-only result immediately
      const scanKey = `plately_scan_${Date.now()}`;
      const initialResult: ScanResult = {
        type: data.type,
        restaurantName: data.restaurantName ?? null,
        allDishes: data.dishes,
        enriched: false,
      };
      sessionStorage.setItem(scanKey, JSON.stringify(initialResult));

      // 3a. Auto-save to Supabase (fire-and-forget — must not block UX).
      //     After the save resolves: (a) fire the photo upload, and (b) surface
      //     a dish→recipe map so the enrich route can write USDA macros back to DB.
      const autoSavePromise = autoSaveToSupabase(scanKey);

      // Build a promise that resolves to a dishId→recipeId map once autoSave completes.
      // The first dish's recipeId comes back from autoSave; map all dishes to it for now
      // (multi-dish Supabase IDs require a richer return type, deferred to a future epic).
      const dishToRecipeMapPromise: Promise<Record<string, string> | null> = autoSavePromise.then(
        (recipeId) => {
          if (!recipeId) return null;

          // Upload the captured photo to Supabase Storage
          void fetch("/api/scan/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mimeType, recipeId }),
          }).catch((err: unknown) => {
            console.warn("[CameraModal] photo upload failed (non-blocking):", err instanceof Error ? err.message : err);
          });

          // Build the dish→recipe map for enrich write-back
          const map: Record<string, string> = {};
          data.dishes.forEach((d) => {
            if (d.id) map[d.id] = recipeId;
          });
          return Object.keys(map).length > 0 ? map : null;
        }
      ).catch(() => null);

      // 4. Confidence gate — per-dish confidence from Gemini is 0–1; convert to 0–100.
      //    If no confidence field is present, treat as high confidence (proceed normally).
      const rawConfidence = firstDish.confidence;
      const confidencePct =
        typeof rawConfidence === "number"
          ? Math.round(rawConfidence * 100)
          : 100;

      if (confidencePct < CONFIDENCE_THRESHOLD) {
        // Pause processing flow and ask the user to confirm.
        // Stash the dishToRecipeMap promise so handleInferenceConfirm can pass it to enrich.
        pendingDishToRecipeMapRef.current = dishToRecipeMapPromise;
        setPendingResult({ result: initialResult, confidence: confidencePct, scanKey });
        return;
      }

      // High confidence — proceed immediately
      onProcessingComplete(scanKey);
      fireEnrichment(data.dishes, data.restaurantName, scanKey, initialResult, dishToRecipeMapPromise);
    } catch (err) {
      console.error("[CameraModal] scan error:", err);
      onProcessingError("Couldn't identify the dish — tap to try again.");
    }
  }

  // ─── Confidence gate callbacks ────────────────────────────────────────────

  function handleInferenceConfirm() {
    if (!pendingResult) return;
    const { scanKey, result } = pendingResult;
    const mapPromise = pendingDishToRecipeMapRef.current;
    pendingDishToRecipeMapRef.current = null;
    setPendingResult(null);
    onProcessingComplete(scanKey);
    fireEnrichment(result.allDishes, result.restaurantName, scanKey, result, mapPromise ?? undefined);
  }

  function handleInferenceRetake() {
    setPendingResult(null);
    // Reset camera state and restart
    setCameraError(null);
    setBracketsVisible(true);
    startCamera();
  }

  // ─── Fire-and-forget enrichment ───────────────────────────────────────────

  function fireEnrichment(
    dishes: ScanResult["allDishes"],
    restaurantName: string | null,
    scanKey: string,
    initialResult: ScanResult,
    /** Optional: resolves to a map of Gemini dish ID → Supabase recipe UUID for write-back */
    dishToRecipeMapPromise?: Promise<Record<string, string> | null>
  ) {
    void (async () => {
      try {
        // Collect the dish-to-recipe map if available (best-effort, max 5 s wait)
        let dishToRecipeMap: Record<string, string> | undefined;
        if (dishToRecipeMapPromise) {
          try {
            const resolved = await Promise.race([
              dishToRecipeMapPromise,
              new Promise<null>((res) => setTimeout(() => res(null), 5000)),
            ]);
            if (resolved) dishToRecipeMap = resolved;
          } catch {
            // Map unavailable — enrichment proceeds without write-back
          }
        }

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
            ...(dishToRecipeMap ? { dishToRecipeMap } : {}),
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
            className="sr-only"
            onChange={handleFileUpload}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
