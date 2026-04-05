import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats a dish image alt string: "Name — description" or "Name" if description is blank. */
export function formatDishAlt(name: string, description: string | null | undefined): string {
  return description?.trim() ? `${name} — ${description.trim()}` : name
}
