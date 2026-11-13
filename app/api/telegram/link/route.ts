import { getTelegramLinkDeps } from "@/lib/api/context";
import { handleTelegramUnlink } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function DELETE() {
  return handleTelegramUnlink(await getTelegramLinkDeps());
}
