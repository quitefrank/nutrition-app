import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRestaurantPhotos } from "@/lib/placesPhotos";
import { getApiKeys } from "@/lib/api-keys";
import { supabase } from "@/lib/supabase";

// ─── Request schema ─────────────────────────────────────────

const RequestSchema = z.object({
  query: z.string().min(1).max(200).trim(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  pageToken: z.string().optional(),
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
  nextPageToken: z.string().optional().catch(undefined),
});

// ─── Error helper ────────────────────────────────────────────

function apiError(message: string, code: string, status: 400 | 422 | 500 | 502 | 503) {
  return NextResponse.json({ error: { message, code } }, { status });
}

// ─── Handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = getApiKeys().places;

  if (!apiKey) {
    return apiError("Restaurant search unavailable", "PLACES_UNAVAILABLE", 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "INVALID_REQUEST", 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("query is required", "VALIDATION_ERROR", 422);
  }

  const { query, lat, lng, pageToken } = parsed.data;

  // ─── Supabase cache check ─────────────────────────────────
  // Only for fresh queries — pageToken requests go straight to Places API
  // because the cache has no concept of pagination.
  if (!pageToken) try {
    const { data: cached, error: cacheError } = await supabase
      .from("restaurants")
      .select("id, name, place_id, address, rating, user_ratings_total, reference_image_url")
      .ilike("name", query.trim())
      .not("place_id", "is", null)
      .limit(20);

    if (cacheError) {
      // Non-fatal: log and fall through to live Places call
      console.error("[places/search] Cache query error:", cacheError.message);
    } else if (cached && cached.length > 0) {
      const results = cached.map((r) => ({
        placeId: r.place_id!,
        name: r.name,
        address: r.address ?? "",
        rating: r.rating ?? null,
        userRatingCount: r.user_ratings_total ?? null,
        photoUrl: r.reference_image_url ?? null,
      }));
      return NextResponse.json({ data: results });
    }
  } catch (cacheErr) {
    // Non-fatal: unexpected error in cache path — fall through to Places
    console.error(
      "[places/search] Unexpected cache error:",
      cacheErr instanceof Error ? cacheErr.message : String(cacheErr)
    );
  }

  // Google Places API (New): when paginating, pageToken must accompany all
  // original request parameters — sending only pageToken causes a 400.
  const requestBody: Record<string, unknown> = {
    textQuery: query,
    languageCode: "en",
    includedType: "restaurant",
    pageSize: 20,
    ...(pageToken ? { pageToken } : {}),
    ...(lat !== undefined && lng !== undefined
      ? {
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: 50000,
            },
          },
          rankPreference: "DISTANCE",
        }
      : {}),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,nextPageToken",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable)");
      console.error(
        "[places/search] Places API returned non-ok status:",
        response.status,
        errorBody
      );
      return apiError("Restaurant search unavailable", "PLACES_UNAVAILABLE", 503);
    }

    const parsed = PlacesResponseSchema.parse(await response.json());

    const baseResults = parsed.places
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

    return NextResponse.json({
      data: results,
      ...(parsed.nextPageToken ? { nextPageToken: parsed.nextPageToken } : {}),
    });
  } catch (err) {
    console.error(
      "[places/search] Unexpected error:",
      err instanceof Error ? err.message : String(err)
    );
    return apiError("Restaurant search unavailable", "PLACES_UNAVAILABLE", 503);
  }
}
