import { getDeps } from "@/lib/api/context";
import { handleCreateBet, handleListBets } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleListBets(await getDeps(), request);
}

export async function POST(request: Request) {
  return handleCreateBet(await getDeps(), request);
}
