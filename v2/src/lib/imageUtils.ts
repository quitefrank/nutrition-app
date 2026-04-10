/**
 * imageUtils — client-side image compression utilities.
 *
 * SEC-DAT-1.00: Image data is processed entirely in memory on the client;
 * no pixel data is persisted to storage at this layer.
 */

export interface CompressOptions {
  /** Maximum width (or height — whichever is larger) in pixels. Default: 1920 */
  maxWidth?: number;
  /** JPEG quality, 0–1. Default: 0.85 */
  quality?: number;
}

/**
 * Resize and re-encode a File or Blob as JPEG.
 *
 * - Scales down proportionally so neither dimension exceeds `maxWidth`.
 * - Images already smaller than `maxWidth` are re-encoded at the requested
 *   quality but not scaled up.
 * - Returns a new Blob with type `image/jpeg`.
 *
 * Designed to keep images well under Vercel's 4.5 MB body limit.
 * Raw HEIC/PNG photos from modern phones can be 4–8 MB before compression.
 */
export async function compressImage(
  image: File | Blob,
  { maxWidth = 1920, quality = 0.85 }: CompressOptions = {}
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Failed to read image file"));

    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();

      img.onerror = () => reject(new Error("Failed to decode image"));

      img.onload = () => {
        const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas toBlob returned null"));
            }
          },
          "image/jpeg",
          quality
        );
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(image);
  });
}
