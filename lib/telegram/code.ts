import { createHash, randomInt } from "node:crypto";

/** No 0, 1, I, L or O, so a code read off a screen is not mistyped. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 10;
const SHAPE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

export function generateLinkCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Only this hash is stored, so the database never holds a usable code. */
export function hashLinkCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** What a person typed as a code, tidied (case, spaces, dashes), or null if it cannot be one. */
export function normalizeLinkCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return SHAPE.test(code) ? code : null;
}
