import { BetForm } from "../bet-form";

export const metadata = { title: "Add bet" };

export default async function NewBetPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  return <BetForm mode="create" draftId={typeof draft === "string" ? draft : undefined} />;
}
