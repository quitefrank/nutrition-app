"use client";

import { useState, useEffect } from "react";

/**
 * Reactively tracks navigator.onLine.
 * Returns true when network is available, false when offline.
 * SSR-safe: defaults to true on the server.
 */
export function useOnlineStatus(): boolean {
  // Always initialize to true so the server render and first client render match.
  // The useEffect below immediately syncs to the real navigator.onLine value after
  // hydration, preventing the SSR/client mismatch that occurs when the device is
  // already offline at first paint.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
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
