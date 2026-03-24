import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

export function RankDelta({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        <ArrowUp className="h-3.5 w-3.5" />
        {value}
      </span>
    );
  }

  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-negative">
        <ArrowDown className="h-3.5 w-3.5" />
        {Math.abs(value)}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium text-muted")}>
      <ArrowRight className="h-3.5 w-3.5" />
      0
    </span>
  );
}
