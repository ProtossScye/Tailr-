import { getTelegramLinkDeps } from "@/lib/api/context";
import { handleTelegramLinkCode } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleTelegramLinkCode(await getTelegramLinkDeps());
}
