"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FrostedCard } from "@/components/ui/FrostedCard";
import { autoSaveToSupabase } from "@/lib/supabaseAutoSave";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportedIngredient {
  name: string;
  quantity: string | null;
  unit: string | null;
  confidenceLevel: "high" | "medium" | "low";
}

interface ImportedRecipe {
  name: string;
  description: string;
  calorieEstimate: number | null;
  servings: number;
  ingredients: ImportedIngredient[];
}

type ImportStatus = "idle" | "loading" | "success" | "error";

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
      style={{ color: "var(--color-accent)" }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ImportScreenProps {
  /** When true, renders only the form + result content — no page wrapper or heading. */
  embedded?: boolean;
}

export function ImportScreen({ embedded = false }: ImportScreenProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [urlInput, setUrlInput] = useState(() => searchParams.get("url") ?? "");
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [recipe, setRecipe] = useState<ImportedRecipe | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Auto-trigger import if url was pre-populated from query string
  useEffect(() => {
    const preUrl = searchParams.get("url");
    if (preUrl && preUrl.trim()) {
      void runImport(preUrl.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Import handler ─────────────────────────────────────────────────────────

  const runImport = useCallback(async (url: string) => {
    setStatus("loading");
    setRecipe(null);
    setErrorMessage("");

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const body = await res.json().catch(() => ({})) as { recipe?: ImportedRecipe; error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? "Import failed");
      }

      if (!body.recipe) {
        throw new Error("No recipe data returned");
      }

      setRecipe(body.recipe);
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = urlInput.trim();
      if (!trimmed) return;
      void runImport(trimmed);
    },
    [urlInput, runImport]
  );

  // ─── "Add to Collection" ────────────────────────────────────────────────────
  // Saves imported recipe to sessionStorage in the same envelope as scan results
  // so the existing recipe page can render it.

  const handleAddToCollection = useCallback(() => {
    if (!recipe) return;

    const scanKey = `plately_scan_${Date.now()}`;
    const scanResult = {
      type: "dish" as const,
      restaurantName: null,
      allDishes: [
        {
          id: crypto.randomUUID(),
          name: recipe.name,
          description: recipe.description,
          calorieEstimate: recipe.calorieEstimate,
          confidence: 1.0,
          servings: recipe.servings,
          ingredients: recipe.ingredients,
        },
      ],
      // Imported recipes have fully-known ingredients — mark as enriched so the
      // recipe page doesn't show "Identifying ingredients…" indefinitely.
      enriched: true,
      importedFromUrl: urlInput.trim(),
    };

    try {
      sessionStorage.setItem(scanKey, JSON.stringify(scanResult));
      // Fire-and-forget Supabase save — non-blocking, same pattern as scan flow
      void autoSaveToSupabase(scanKey);
      router.push(`/recipe/${scanKey}`);
    } catch {
      setErrorMessage("Could not save recipe — storage may be full.");
      setStatus("error");
    }
  }, [recipe, urlInput, router]);

  const handleReset = useCallback(() => {
    setUrlInput("");
    setRecipe(null);
    setStatus("idle");
    setErrorMessage("");
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const springTransition = { type: "spring" as const, damping: 26, stiffness: 340 };

  const content = (
    <>
      {/* URL form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={embedded ? springTransition : { ...springTransition, delay: 0.05 }}
      >
          <FrostedCard>
            {embedded && (
              <>
                <h2
                  className="mb-2"
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "1.0625rem",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Import a Recipe
                </h2>
                <p
                  className="mb-4"
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.55,
                  }}
                >
                  Paste a URL from AllRecipes, NYT Cooking, or any recipe site and Plately will extract the recipe for your collection.
                </p>
              </>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.allrecipes.com/recipe/…"
                aria-label="Recipe URL"
                autoComplete="url"
                disabled={status === "loading"}
                className="w-full rounded-[var(--radius-md)] px-3 py-2.5 text-sm outline-none"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-card-border)",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  minHeight: 44,
                  opacity: status === "loading" ? 0.6 : 1,
                  transition: "opacity 0.15s ease",
                }}
              />
              <button
                type="submit"
                disabled={!urlInput.trim() || status === "loading"}
                className="btn-pill btn-primary w-full"
                style={{
                  opacity: (!urlInput.trim() || status === "loading") ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {status === "loading" ? (
                  <>
                    <Spinner />
                    <span>Extracting recipe…</span>
                  </>
                ) : (
                  "Import Recipe"
                )}
              </button>
            </form>
          </FrostedCard>
        </motion.div>

        {/* Error state */}
        <AnimatePresence>
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={springTransition}
            >
              <FrostedCard>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "var(--color-error-light)" }}
                      aria-hidden="true"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="var(--color-error)" strokeWidth="1.75" />
                        <path d="M12 7v5M12 16v1" stroke="var(--color-error)" strokeWidth="1.75" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <p
                        style={{
                          fontWeight: 600,
                          fontSize: "0.9375rem",
                          color: "var(--color-text-primary)",
                          marginBottom: 2,
                        }}
                      >
                        Import failed
                      </p>
                      <p
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--color-text-secondary)",
                          lineHeight: 1.5,
                        }}
                      >
                        {errorMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void runImport(urlInput.trim())}
                    disabled={!urlInput.trim()}
                    className="btn-pill btn-secondary text-sm"
                    style={{ height: 44, fontSize: "0.875rem" }}
                  >
                    Try again
                  </button>
                </div>
              </FrostedCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recipe preview */}
        <AnimatePresence>
          {status === "success" && recipe && (
            <motion.div
              key="recipe"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springTransition}
              className="space-y-4"
            >
              <FrostedCard elevated>
                {/* Recipe header */}
                <h2
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "1.375rem",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    marginBottom: 6,
                    lineHeight: 1.25,
                  }}
                >
                  {recipe.name}
                </h2>

                {recipe.description && (
                  <p
                    style={{
                      fontSize: "0.9375rem",
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.55,
                      marginBottom: 14,
                    }}
                  >
                    {recipe.description}
                  </p>
                )}

                {/* Meta chips */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {recipe.servings > 0 && (
                    <MetaChip label={`${recipe.servings} serving${recipe.servings !== 1 ? "s" : ""}`} />
                  )}
                  {recipe.calorieEstimate != null && (
                    <MetaChip label={`~${recipe.calorieEstimate} cal`} accent />
                  )}
                </div>

                {/* Ingredients list */}
                {recipe.ingredients.length > 0 && (
                  <>
                    <h3
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "var(--color-text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 10,
                      }}
                    >
                      Ingredients
                    </h3>
                    <ul className="space-y-2" aria-label="Ingredients">
                      {recipe.ingredients.map((ing, i) => (
                        <li
                          key={i}
                          className="flex items-baseline gap-2"
                          style={{ fontSize: "0.9375rem" }}
                        >
                          <span
                            className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                            style={{ background: "var(--color-accent)", opacity: 0.6 }}
                            aria-hidden="true"
                          />
                          <span style={{ color: "var(--color-text-secondary)" }}>
                            {[ing.quantity, ing.unit, ing.name].filter(Boolean).join(" ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </FrostedCard>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleAddToCollection}
                  className="btn-pill btn-primary w-full"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Add to Collection
                </button>

                <button
                  onClick={handleReset}
                  className="btn-pill btn-ghost w-full"
                  style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}
                >
                  Try another URL
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </>
  );

  if (embedded) return content;

  return (
    <div className="scroll-content">
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto space-y-5">
        {/* Page heading */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <h1
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 4,
            }}
          >
            Import a Recipe
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--color-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            Paste a URL from AllRecipes, NYT Cooking, or any recipe site.
          </p>
        </motion.div>
        {content}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function MetaChip({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
      style={{
        background: accent ? "var(--color-accent-light)" : "var(--color-surface-raised)",
        color: accent ? "var(--color-accent)" : "var(--color-text-secondary)",
        border: `1px solid ${accent ? "rgba(196,98,45,0.18)" : "var(--color-card-border)"}`,
      }}
    >
      {label}
    </span>
  );
}
