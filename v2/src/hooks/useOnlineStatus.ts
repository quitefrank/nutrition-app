"use client";

import { useState, useEffect } from "react";

/**
 * Reactively tracks navigator.onLine.
 * Returns true when network is available, false when offline.
 * SSR-safe: defaults to true on the server.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    // Re-read the real value immediately on mount. Closes the hydration gap where
    // SSR defaults to true but the device is already offline at first paint.
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
