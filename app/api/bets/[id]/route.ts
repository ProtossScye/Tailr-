import { getDeps } from "@/lib/api/context";
import { handleDeleteBet, handleGetBet, handleUpdateBet } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handleGetBet(await getDeps(), id);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handleUpdateBet(await getDeps(), request, id);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handleDeleteBet(await getDeps(), id);
}
