"use client";

/**
 * RemoveRestaurantSheet — confirmation bottom sheet for restaurant removal.
 *
 * Shows: "Remove [name]? This will also remove [N] dish(es)."
 * Destructive confirm button uses var(--color-accent) (terracotta #C4622D).
 * Cancel button is ghost/secondary style.
 *
 * Uses useRemoveRestaurant(restaurantId) optimistic mutation. On confirm:
 *   - Fires mutation; onClose is called only on success (sheet stays open on error).
 *   - On error: inline error message appears; confirm button becomes "Try again".
 * On cancel: calls onClose without mutation.
 *
 * AC5: on DELETE failure, card reappears (optimistic rollback) AND an inline
 *      error message appears with a retry path via "Try again" button.
 */

import { BottomSheet } from "@/components/ui/BottomSheet";
import { useRemoveRestaurant } from "@/hooks/useRemoveRestaurant";

interface RemoveRestaurantSheetProps {
  restaurantId: string;
  restaurantName: string;
  dishCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export function RemoveRestaurantSheet({
  restaurantId,
  restaurantName,
  dishCount,
  isOpen,
  onClose,
}: RemoveRestaurantSheetProps) {
  const { mutate: removeRestaurant, isPending, isError } = useRemoveRestaurant(restaurantId);

  const dishWord = dishCount === 1 ? "dish" : "dishes";

  function handleConfirm() {
    removeRestaurant(restaurantId, {
      onSuccess: () => {
        onClose();
      },
    });
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      label={`Remove ${restaurantName}`}
    >
      {/* Confirmation copy */}
      <p
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        Remove {restaurantName}?
      </p>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--color-text-secondary)",
          marginBottom: isError ? 12 : 24,
          lineHeight: 1.5,
        }}
      >
        This will also remove {dishCount} {dishWord}.
      </p>

      {/* Inline error message (AC5) */}
      {/* WCAG 2.1 AA: terracotta is not a semantic error colour and is not permitted for
          actionable error/warning messages. Use --color-error (or text-secondary as
          accessible fallback) so screen readers and sighted users get a neutral but
          readable error message rather than a decorative accent. */}
      {isError && (
        <p
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: "var(--color-error, var(--color-text-secondary))",
            marginBottom: 16,
            lineHeight: 1.4,
          }}
        >
          Couldn&apos;t remove this restaurant. Please try again.
        </p>
      )}

      {/* Destructive confirm / retry button — terracotta (var(--color-accent)) */}
      <button
        onClick={handleConfirm}
        disabled={isPending}
        style={{
          display: "block",
          width: "100%",
          height: 50,
          borderRadius: 12,
          background: "var(--color-accent)",
          color: "#fff",
          fontSize: "0.9375rem",
          fontWeight: 600,
          fontFamily: "var(--font-body), system-ui, sans-serif",
          border: "none",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.7 : 1,
          marginBottom: 10,
          letterSpacing: "0.01em",
        }}
      >
        {isError ? "Try again" : "Remove restaurant"}
      </button>

      {/* Cancel — ghost/secondary style */}
      <button
        onClick={onClose}
        disabled={isPending}
        style={{
          display: "block",
          width: "100%",
          height: 50,
          borderRadius: 12,
          background: "transparent",
          color: "var(--color-text-secondary)",
          fontSize: "0.9375rem",
          fontWeight: 500,
          fontFamily: "var(--font-body), system-ui, sans-serif",
          border: "1.5px solid var(--color-card-border, rgba(255,255,255,0.12))",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.7 : 1,
          letterSpacing: "0.01em",
        }}
      >
        Cancel
      </button>
    </BottomSheet>
  );
}
