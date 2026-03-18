export function convertToGrams(quantity: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'g': return quantity;
    case 'ml': return quantity;
    case 'tbsp': return quantity * 15;
    case 'tsp': return quantity * 5;
    case 'cup': return quantity * 240;
    case 'oz': return quantity * 28.3495;
    case 'lb': return quantity * 453.592;
    default: throw new Error(`Unsupported unit: ${unit}`);
  }
}

export const SUPPORTED_UNITS = ['g', 'ml', 'tbsp', 'tsp', 'cup', 'oz', 'lb'] as const;
export type SupportedUnit = typeof SUPPORTED_UNITS[number];
