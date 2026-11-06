/**
 * Gets a screenshot ready to send: shrunk and re-saved as a JPEG in the browser. That keeps uploads
 * small and fast on mobile data, and re-saving drops hidden photo details such as location. The
 * original file never leaves the phone.
 */

/** Longest side, in pixels, that is sent. Big enough to keep small slip text readable. */
export const MAX_SIDE = 2200;
/** Aim for at most this many bytes. The server accepts up to 3 MB. */
export const TARGET_BYTES = 1_500_000;
/** Refuse files larger than this before even trying to open them. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class ImageError extends Error {}

/** The size after scaling down so the longest side is at most `max`. Never scales up. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new ImageError("Choose a picture, such as a screenshot of your slip.");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("That picture is very large. Take a normal screenshot and try again.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("This picture could not be opened. Use a screenshot saved as JPG, PNG or WebP.");
  }

  try {
    let side = MAX_SIDE;
    // Try smaller sizes only if the picture is still too heavy at the lowest quality.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new ImageError("This browser cannot prepare pictures. Paste the text instead.");
      // JPEG has no transparency; a transparent screenshot would otherwise turn black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.85, 0.75, 0.65, 0.55]) {
        const blob = await toBlob(canvas, quality);
        if (!blob) throw new ImageError("This picture could not be prepared. Try another one.");
        if (blob.size <= TARGET_BYTES) return blob;
      }
      side = Math.round(side * 0.75);
    }
  } finally {
    bitmap.close();
  }
  throw new ImageError("That picture is too detailed to send. Crop it to just the slip and try again.");
}
