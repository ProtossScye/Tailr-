import { getSlipDeps } from "@/lib/api/context";
import { handleDeleteSlip, handleGetSlip, handleUpdateSlip } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handleGetSlip(await getSlipDeps(), id);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handleUpdateSlip(await getSlipDeps(), request, id);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handleDeleteSlip(await getSlipDeps(), id);
}
