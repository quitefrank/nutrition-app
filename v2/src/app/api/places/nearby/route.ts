import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

// ─── Handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Location service not configured", code: "SERVICE_UNAVAILABLE" },
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
      {
        error: "lat and lng are required and must be valid coordinates",
        code: "INVALID_REQUEST",
      },
      { status: 400 }
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
            "places.id,places.displayName,places.formattedAddress",
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
      return NextResponse.json(
        { error: "Location lookup failed", code: "PLACES_ERROR" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
      }>;
    };

    const results = (data.places ?? [])
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => ({
        placeId: p.id!,
        name: p.displayName!.text!,
        address: p.formattedAddress ?? "",
      }));

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error(
      "[places/nearby] Unexpected error:",
      error instanceof Error ? error.message : "Unknown"
    );
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
