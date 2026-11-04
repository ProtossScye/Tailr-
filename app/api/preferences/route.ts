import { getPreferencesDeps } from "@/lib/api/context";
import { handleClearPreferences, handleGetPreferences, handleSavePreferences } from "@/lib/api/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleGetPreferences(await getPreferencesDeps());
}

export async function PUT(request: Request) {
  return handleSavePreferences(await getPreferencesDeps(), request);
}

export async function DELETE() {
  return handleClearPreferences(await getPreferencesDeps());
}
