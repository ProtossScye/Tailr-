import { BetDetail } from "./bet-detail";

export const metadata = { title: "Bet" };

export default async function BetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  return <BetDetail id={id} saved={saved === "created" || saved === "updated" ? saved : undefined} />;
}
