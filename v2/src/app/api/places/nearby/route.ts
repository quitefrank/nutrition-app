import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantPhotos } from "@/lib/placesPhotos";
import { getApiKeys } from "@/lib/api-keys";

// ─── Constants ──────────────────────────────────────────────

const MAX_RADIUS_M = 50_000;
const DEFAULT_RADIUS_M = 200;
const MAX_RESULTS = 3;

// ─── Request schema ─────────────────────────────────────────

const RequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().positive().max(MAX_RADIUS_M).optional(),
});

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

// ─── Error helper ────────────────────────────────────────────

function apiError(message: string, code: string, status: 400 | 422 | 500 | 502 | 503) {
  return NextResponse.json({ error: { message, code } }, { status });
}

// ─── Handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = getApiKeys().places;

  if (!apiKey) {
    return apiError("Location service not configured", "SERVICE_UNAVAILABLE", 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "INVALID_REQUEST", 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "lat and lng are required and must be valid coordinates",
      "VALIDATION_ERROR",
      422
    );
  }

  const { lat, lng, radius = DEFAULT_RADIUS_M } = parsed.data;
  const clampedRadius = Math.min(radius, MAX_RADIUS_M);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
        },
        body: JSON.stringify({
          includedTypes: [
            "restaurant",
            "cafe",
            "meal_takeaway",
            "fast_food_restaurant",
          ],
          maxResultCount: MAX_RESULTS,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: clampedRadius,
            },
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.error("[places/nearby] Places API error:", res.status);
      return apiError("Location lookup failed", "PLACES_ERROR", 502);
    }

    const { places } = PlacesResponseSchema.parse(await res.json());

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
  } catch (error) {
    console.error(
      "[places/nearby] Unexpected error:",
      error instanceof Error ? error.message : "Unknown"
    );
    return apiError("Internal server error", "INTERNAL_ERROR", 500);
  }
}
