import type { TelegramLinkCodeJson, TelegramStatusJson } from "@/lib/api/types";
import { api } from "./api";

export const fetchTelegramStatus = () => api<TelegramStatusJson>("/api/telegram/status");
export const makeTelegramCode = () => api<TelegramLinkCodeJson>("/api/telegram/link-code", { method: "POST" });
export const disconnectTelegram = () => api<{ removed: boolean }>("/api/telegram/link", { method: "DELETE" });

/** "Connected on 12 Nov 2026" in the person's own words, or "" for a date that cannot be read. */
export function connectedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}
