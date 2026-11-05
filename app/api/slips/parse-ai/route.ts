import { getAiDeps } from "@/lib/api/context";
import { handleReadSlipWithAi } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleReadSlipWithAi(await getAiDeps(), request);
}
