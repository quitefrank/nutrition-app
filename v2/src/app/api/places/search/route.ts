import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────

interface PlacesPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
}

interface PlacesApiResponse {
  places?: PlacesPlace[];
}

// ─── Request schema ─────────────────────────────────────────

const RequestSchema = z.object({
  query: z.string().min(1).max(200).trim(),
});

// ─── Handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

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

  const { query } = parsed.data;

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ textQuery: query, languageCode: "en" }),
      }
    );

    if (!response.ok) {
      console.error(
        "[places/search] Places API returned non-ok status:",
        response.status
      );
      return NextResponse.json(
        { error: "Restaurant search unavailable", code: "PLACES_UNAVAILABLE" },
        { status: 503 }
      );
    }

    const json: PlacesApiResponse = await response.json();
    const places = json.places ?? [];

    const results = places
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => ({
        placeId: p.id,
        name: p.displayName!.text,
        address: p.formattedAddress ?? "",
        photoUrl: null,
      }));

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
