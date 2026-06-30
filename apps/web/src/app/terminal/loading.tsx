import { Skeleton } from "@/components/ui/skeleton";

export default function TerminalLoading() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
