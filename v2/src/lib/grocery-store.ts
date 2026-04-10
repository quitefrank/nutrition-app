export interface GroceryItem {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  dishName: string;
  restaurantName: string | null;
  checked: boolean;
  addedAt: number;
}

const KEY = "plately_grocery";

export function readGroceryList(): GroceryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GroceryItem[]).filter((i) => i && typeof i.name === 'string') : [];
  } catch {
    return [];
  }
}

function writeGroceryList(items: GroceryItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("plately:grocery-updated"));
}

// ─── Quantity merge helpers ─────────────────────────────────────────────────

/**
 * Parse a quantity string into a numeric value. Returns null if not parseable.
 * Handles integers, decimals, and simple fractions like "1/2".
 */
function parseQuantity(q: string | null): number | null {
  if (!q) return null;
  const trimmed = q.trim();
  // Simple fraction: e.g. "1/2"
  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]);
    const den = parseFloat(fractionMatch[2]);
    if (den !== 0) return num / den;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a number back to a quantity string. Rounds to 2 decimal places,
 * trims trailing zeros and a trailing decimal point.
 */
function formatQuantity(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

/**
 * Attempt to merge two quantity/unit pairs numerically.
 * Returns merged { quantity, unit } or null if units differ or quantities are non-numeric.
 */
function tryMergeQuantities(
  existingQty: string | null,
  existingUnit: string | null,
  newQty: string | null,
  newUnit: string | null
): { quantity: string | null; unit: string | null } | null {
  // Units must match (case-insensitive) or both be null
  const unitA = existingUnit?.trim().toLowerCase() ?? null;
  const unitB = newUnit?.trim().toLowerCase() ?? null;
  if (unitA !== unitB) return null;

  const numA = parseQuantity(existingQty);
  const numB = parseQuantity(newQty);
  if (numA === null || numB === null) return null;

  return {
    quantity: formatQuantity(numA + numB),
    unit: existingUnit ?? newUnit,
  };
}

// ─── SW messaging ─────────────────────────────────────────────────────────────

/**
 * Post a grocery mutation action to the service worker for offline queuing.
 * The SW stores it in IndexedDB and replays it to Supabase on reconnect.
 * Safe to call when the SW isn't registered — the optional-chain guards against it.
 */
function postSWAction(kind: 'toggle' | 'remove', itemId: string): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({
    type: 'GROCERY_ACTION',
    action: { kind, itemId },
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function addIngredientsToGrocery(
  ingredients: Array<{ name: string; quantity?: string | null; unit?: string | null }>,
  dishName: string,
  restaurantName: string | null
): void {
  const existing = readGroceryList();
  const now = Date.now();
  const updated = [...existing];

  for (const ingredient of ingredients) {
    const trimmedName = ingredient.name.trim();
    if (!trimmedName) continue;

    const nameLower = trimmedName.toLowerCase();

    // Find an existing item with the same name (case-insensitive)
    const existingIdx = updated.findIndex((i) => i.name.toLowerCase() === nameLower);

    if (existingIdx !== -1) {
      // Try to merge quantities
      const existingItem = updated[existingIdx];
      const merged = tryMergeQuantities(
        existingItem.quantity,
        existingItem.unit,
        ingredient.quantity ?? null,
        ingredient.unit ?? null
      );
      if (merged) {
        updated[existingIdx] = { ...existingItem, quantity: merged.quantity, unit: merged.unit };
      }
      // If can't merge numerically, skip duplicate (keep existing)
    } else {
      // New item
      updated.push({
        id: crypto.randomUUID(),
        name: trimmedName,
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit ?? null,
        dishName,
        restaurantName,
        checked: false,
        addedAt: now,
      });
    }
  }

  writeGroceryList(updated);
}

export function toggleGroceryItem(id: string): void {
  const items = readGroceryList().map((item) =>
    item.id === id ? { ...item, checked: !item.checked } : item
  );
  writeGroceryList(items);
  postSWAction('toggle', id);
}

export function removeGroceryItem(id: string): void {
  writeGroceryList(readGroceryList().filter((item) => item.id !== id));
  postSWAction('remove', id);
}

export function clearGroceryList(): void {
  writeGroceryList([]);
}

export function clearCheckedItems(): void {
  writeGroceryList(readGroceryList().filter((item) => !item.checked));
}
