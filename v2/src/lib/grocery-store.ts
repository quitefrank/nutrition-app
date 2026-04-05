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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGroceryList(items: GroceryItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("plately:grocery-updated"));
}

export function addIngredientsToGrocery(
  ingredients: Array<{ name: string; quantity?: string | null; unit?: string | null }>,
  dishName: string,
  restaurantName: string | null
): void {
  const existing = readGroceryList();
  const now = Date.now();
  const newItems: GroceryItem[] = ingredients
    .filter((i) => i.name.trim())
    .map((i) => ({
      id: crypto.randomUUID(),
      name: i.name.trim(),
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      dishName,
      restaurantName,
      checked: false,
      addedAt: now,
    }));
  writeGroceryList([...existing, ...newItems]);
}

export function toggleGroceryItem(id: string): void {
  const items = readGroceryList().map((item) =>
    item.id === id ? { ...item, checked: !item.checked } : item
  );
  writeGroceryList(items);
}

export function removeGroceryItem(id: string): void {
  writeGroceryList(readGroceryList().filter((item) => item.id !== id));
}

export function clearGroceryList(): void {
  writeGroceryList([]);
}

export function clearCheckedItems(): void {
  writeGroceryList(readGroceryList().filter((item) => !item.checked));
}
