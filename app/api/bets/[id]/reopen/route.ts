import { getDeps } from "@/lib/api/context";
import { handleReopenBet } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReopenBet(await getDeps(), id);
}
