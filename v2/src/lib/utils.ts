/** Merge class names (simple, no clsx/twMerge dependency) */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
