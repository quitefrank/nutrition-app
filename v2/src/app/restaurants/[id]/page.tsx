import { AppShell } from "@/components/AppShell";
import { RestaurantScreen } from "@/components/screens/RestaurantScreen";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <AppShell>
      <RestaurantScreen placeId={decodeURIComponent(id)} />
    </AppShell>
  );
}
