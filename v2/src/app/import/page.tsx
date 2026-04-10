import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ImportScreen } from "@/components/screens/ImportScreen";

export default function ImportPage() {
  return (
    <AppShell>
      <Suspense>
        <ImportScreen />
      </Suspense>
    </AppShell>
  );
}
