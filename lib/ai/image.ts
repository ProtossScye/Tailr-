import type { AiImageType } from "./types";

/** What the server accepts. The browser shrinks screenshots well below this before sending. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MIN_IMAGE_BYTES = 100;

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

/**
 * The real type of an image, from its first bytes, or null. What the browser or the upload claims is
 * not trusted: only JPEG, PNG and WebP are accepted, and nothing else (GIF, PDF, HTML, SVG) is passed on.
 */
export function detectImageType(bytes: Uint8Array): AiImageType | null {
  if (bytes.length < MIN_IMAGE_BYTES) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "RIFF" ???? "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}
