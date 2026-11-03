import { CreateView } from "./create-view";

export const metadata = { title: "Create" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  return <CreateView draftId={typeof draft === "string" ? draft : undefined} />;
}
