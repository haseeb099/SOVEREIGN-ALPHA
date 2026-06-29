import { redirect } from "next/navigation";
import { DEFAULT_TICKER } from "@sovereign/shared";

export default function TerminalIndexPage() {
  redirect(`/terminal/${DEFAULT_TICKER}/memo`);
}
