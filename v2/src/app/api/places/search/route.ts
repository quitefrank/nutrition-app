import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantPhotos } from "@/lib/placesPhotos";
import { getApiKeys } from "@/lib/api-keys";

// ─── Request schema ─────────────────────────────────────────

const RequestSchema = z.object({
  query: z.string().min(1).max(200).trim(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine(
  (data) => (data.lat === undefined) === (data.lng === undefined),
  { message: "lat and lng must both be provided or both be absent", path: ["lat"] }
);

// ─── Places API response schema ──────────────────────────────
// Lenient: .catch([]) so a malformed response degrades to empty results.

const PlacesResponseSchema = z.object({
  places: z.array(
    z.object({
      id: z.string(),
      displayName: z.object({ text: z.string() }).optional().catch(undefined),
      formattedAddress: z.string().optional().catch(undefined),
      rating: z.number().optional().catch(undefined),
      userRatingCount: z.number().optional().catch(undefined),
    })
  ).catch([]),
});

// ─── Handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = getApiKeys().places;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "query is required", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const { query, lat, lng } = parsed.data;

  const requestBody: Record<string, unknown> = {
    textQuery: query,
    languageCode: "en",
    includedType: "restaurant",
  };

  if (lat !== undefined && lng !== undefined) {
    requestBody.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 50000, // 50 km soft bias
      },
    };
    requestBody.rankPreference = "DISTANCE";
  }

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable)");
      console.error(
        "[places/search] Places API returned non-ok status:",
        response.status,
        errorBody
      );
      return NextResponse.json(
        { error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" },
        { status: 503 }
      );
    }

    const { places } = PlacesResponseSchema.parse(await response.json());

    const baseResults = places
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => ({
        placeId: p.id,
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? "",
        rating: p.rating ?? null,
        userRatingCount: p.userRatingCount ?? null,
      }));

    // Resolve one photo per result in parallel — best-effort, degrades to null
    const results = await Promise.all(
      baseResults.map(async (r) => {
        const photos = await getRestaurantPhotos({ placeId: r.placeId }, apiKey, 1).catch(() => []);
        return { ...r, photoUrl: photos[0] ?? null };
      })
    );

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error(
      "[places/search] Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
