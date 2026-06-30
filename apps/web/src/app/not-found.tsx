import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-mono text-2xl font-bold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This ticker or page does not exist. Check the symbol or return to the terminal.
      </p>
      <Button render={<Link href="/terminal" />}>Back to terminal</Button>
    </main>
  );
}
