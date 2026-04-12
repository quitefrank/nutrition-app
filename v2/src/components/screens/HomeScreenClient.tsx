"use client";

import dynamic from "next/dynamic";

// HomeScreen reads sessionStorage and live query data — no meaningful server output.
// Skip SSR here (inside a Client Component, where ssr:false is allowed) to prevent
// hydration mismatches caused by Array.from().map() key diffing in React 19.
const HomeScreen = dynamic(
  () => import("@/components/screens/HomeScreen").then((m) => ({ default: m.HomeScreen })),
  { ssr: false }
);

export function HomeScreenClient() {
  return <HomeScreen />;
}
