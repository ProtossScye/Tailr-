import { EditBet } from "../../bet-form";

export const metadata = { title: "Edit bet" };

export default async function EditBetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditBet id={id} />;
}
