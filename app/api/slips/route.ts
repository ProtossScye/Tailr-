import { getSlipDeps } from "@/lib/api/context";
import { handleCreateSlip, handleListSlips } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListSlips(await getSlipDeps(), request);
}

export async function POST(request: Request) {
  return handleCreateSlip(await getSlipDeps(), request);
}
