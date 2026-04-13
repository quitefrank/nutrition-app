import "server-only";

/**
 * POST /api/scan/upload
 *
 * Uploads a captured dish photo to Supabase Storage bucket `dish-photos`.
 * File path: recipes/{recipeId}/dish.jpg
 *
 * Returns { photoUrl: string | null }.
 *
 * This route is intentionally non-fatal: any error (missing bucket, missing
 * env vars, Supabase Storage unavailable) returns { photoUrl: null } so
 * the scan UX is never blocked.
 *
 * SEC-ACC-1.00: uses service role key for storage — the anon key cannot
 *              upload to private buckets. The key lives server-side only.
 * SEC-INJ-1.00: all inputs validated with Zod before use.
 * SEC-DAT-1.00: imageBase64 is decoded in memory; never logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";
import { getApiKeys } from "@/lib/api-keys";

const BUCKET = "dish-photos";

// ─── Request schema ───────────────────────────────────────────────────────────

const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const RequestSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  recipeId: z.string().uuid(),
});

// ─── Supabase service-role client (server-only) ───────────────────────────────

function getServiceClient() {
  const { supabaseUrl, supabaseServiceRole } = getApiKeys();
  const url = supabaseUrl ?? "";
  const serviceKey = supabaseServiceRole ?? "";
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function apiError(message: string, code: string, status: 400 | 422 | 500 | 502 | 503) {
  return NextResponse.json({ error: { message, code } }, { status });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    if (!supabase) {
      // Storage not configured — return null gracefully
      return NextResponse.json({ photoUrl: null });
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
        "imageBase64, mimeType, and recipeId are required",
        "VALIDATION_ERROR",
        422
      );
    }

    const { imageBase64, mimeType, recipeId } = parsed.data;

    // Decode base64 to binary (SEC-DAT-1.00: never log the raw bytes)
    // Buffer.from never throws on invalid base64 — guard against empty/corrupt input
    const fileBuffer = Buffer.from(imageBase64, "base64");
    if (fileBuffer.length === 0) {
      return NextResponse.json({ photoUrl: null });
    }

    const filePath = `recipes/${recipeId}/dish.jpg`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true, // Overwrite if a photo was already uploaded for this recipe
      });

    if (uploadError) {
      console.warn("[scan/upload] Storage upload failed:", uploadError.message);
      return NextResponse.json({ photoUrl: null });
    }

    // Retrieve the public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const photoUrl = urlData?.publicUrl ?? null;

    // SEC-SEC-1.00: validate the returned URL before persisting
    if (typeof photoUrl !== "string" || !photoUrl.startsWith("https://")) {
      return NextResponse.json({ photoUrl: null });
    }

    // Persist photoUrl back to the recipe row
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ dish_image_url: photoUrl })
      .eq("id", recipeId);

    if (updateError) {
      // URL retrieval succeeded — return it even if the update failed
      console.warn("[scan/upload] recipe dish_image_url update failed:", updateError.message);
    }

    return NextResponse.json({ photoUrl });
  } catch (err) {
    // Never let a storage error surface as a 5xx to the client
    console.warn("[scan/upload] unexpected error (non-blocking):", err instanceof Error ? err.message : err);
    return NextResponse.json({ photoUrl: null });
  }
}
