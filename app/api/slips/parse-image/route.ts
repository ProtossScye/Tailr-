import { getAiDeps } from "@/lib/api/context";
import { handleReadSlipImage } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";
// Reading an image can take longer than a text read. Needs a plan that allows it; see docs/STATUS.md.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleReadSlipImage(await getAiDeps(), request);
}
