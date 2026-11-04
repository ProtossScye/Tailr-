import { getSlipDeps } from "@/lib/api/context";
import { handleParseSlip } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleParseSlip(await getSlipDeps(), request);
}
