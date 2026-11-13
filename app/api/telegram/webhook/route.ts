import { getTelegramWebhookDeps } from "@/lib/api/context";
import { handleTelegramWebhook } from "@/lib/api/telegram-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTelegramWebhook(getTelegramWebhookDeps(), request);
}
