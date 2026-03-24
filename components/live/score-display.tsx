import { cn, formatScore, scoreTone } from "@/lib/utils";

export function ScoreDisplay({
  scoreToPar,
  className,
}: {
  scoreToPar: number;
  className?: string;
}) {
  return (
    <span className={cn("score-text text-3xl font-bold tracking-tight", scoreTone(scoreToPar), className)}>
      {formatScore(scoreToPar)}
    </span>
  );
}
