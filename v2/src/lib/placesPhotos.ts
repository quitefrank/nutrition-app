import 'server-only'

/**
 * Fetches public CDN photo URLs for a restaurant from the Google Places API.
 *
 * Accepts either a `placeId` (skip the text-search step) or a `name`
 * (performs a text search first to resolve the placeId).
 *
 * Returns an array of HTTPS CDN URLs — or an empty array on any failure.
 * All URLs are validated to start with https:// (SEC-SEC-1.00).
 */
export async function getRestaurantPhotos(
  opts: { placeId?: string; name?: string },
  placesKey: string,
  maxPhotos = 10
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    let resolvedPlaceId = opts.placeId;

    // If no placeId provided, resolve via text search
    if (!resolvedPlaceId && opts.name) {
      const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.id',
        },
        body: JSON.stringify({ textQuery: opts.name, pageSize: 1 }),
        signal: controller.signal,
      });
      if (!searchRes.ok) return [];
      const searchData = await searchRes.json() as { places?: Array<{ id?: string }> };
      resolvedPlaceId = searchData?.places?.[0]?.id;
    }

    if (!resolvedPlaceId) return [];

    // Fetch photo references
    const detailsRes = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(resolvedPlaceId)}`,
      {
        headers: { 'X-Goog-Api-Key': placesKey, 'X-Goog-FieldMask': 'photos' },
        signal: controller.signal,
      }
    );
    if (!detailsRes.ok) return [];

    const details = await detailsRes.json() as { photos?: Array<{ name: string }> };
    const photoRefs = (details?.photos ?? []).slice(0, maxPhotos);
    if (photoRefs.length === 0) return [];

    // Resolve photo refs → CDN URLs in parallel
    const photoUrls = await Promise.all(
      photoRefs.map(async ({ name }) => {
        try {
          const photoRes = await fetch(
            `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&skipHttpRedirect=true`,
            { headers: { 'X-Goog-Api-Key': placesKey }, signal: controller.signal }
          );
          if (!photoRes.ok) return null;
          const photoJson = await photoRes.json() as { photoUri?: string };
          const uri = photoJson?.photoUri;
          // SEC-SEC-1.00: only accept HTTPS URIs
          return typeof uri === 'string' && uri.startsWith('https://') ? uri : null;
        } catch {
          return null;
        }
      })
    );

    return photoUrls.filter((u): u is string => u !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
