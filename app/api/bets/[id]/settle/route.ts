import { getDeps } from "@/lib/api/context";
import { handleSettleBet } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleSettleBet(await getDeps(), request, id);
}
