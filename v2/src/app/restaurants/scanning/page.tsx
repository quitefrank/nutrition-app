import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ScanRestaurantScreen } from "@/components/screens/ScanRestaurantScreen";

export default function ScanningPage() {
  return (
    <AppShell>
      <Suspense>
        <ScanRestaurantScreen />
      </Suspense>
    </AppShell>
  );
}
