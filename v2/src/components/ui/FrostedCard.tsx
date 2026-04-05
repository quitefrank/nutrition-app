import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface FrostedCardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  /** Remove default padding */
  noPadding?: boolean;
}

export const FrostedCard = forwardRef<HTMLDivElement, FrostedCardProps>(
  ({ className, elevated = false, noPadding = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          elevated ? "frosted-elevated" : "frosted",
          "rounded-[var(--radius-lg)]",
          !noPadding && "p-4",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

FrostedCard.displayName = "FrostedCard";
