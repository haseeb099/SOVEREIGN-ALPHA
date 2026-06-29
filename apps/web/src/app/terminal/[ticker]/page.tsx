import { redirect } from "next/navigation";

export default async function TickerIndexPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  redirect(`/terminal/${ticker}/memo`);
}
