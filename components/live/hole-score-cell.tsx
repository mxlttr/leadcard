import { useI18n } from "@/components/i18n-provider";
import type { PlayerHoleScore } from "@/lib/types";
import { cn } from "@/lib/utils";

function scoreBackground(hole: PlayerHoleScore) {
  if (hole.score === 1) return "bg-[#ffb400] dark:bg-[#94651c]";
  const relativeToPar = hole.relativeToPar;
  if (relativeToPar === null || relativeToPar === 0) return null;
  if (relativeToPar <= -3) return "bg-[#45bc55] dark:bg-[#0a8247]";
  if (relativeToPar === -2) return "bg-[#80d86c] dark:bg-[#1c7045]";
  if (relativeToPar === -1) return "bg-[#bae8a7] dark:bg-[#0a3018]";
  if (relativeToPar === 1) return "bg-[#fbe2de] dark:bg-[#3f161d]";
  if (relativeToPar === 2) return "bg-[#f8a494] dark:bg-[#963b47]";
  return "bg-[#f7745a] dark:bg-[#b43d49]";
}

export function HoleScoreCell({ hole }: { hole: PlayerHoleScore }) {
  const { t } = useI18n();
  const relativeToPar = hole.relativeToPar;
  const background = scoreBackground(hole);
  let label: string | null = null;
  if (hole.score === 1) {
    label = t("player.ace");
  } else if (relativeToPar !== null && relativeToPar <= -3) {
    label = t("player.albatrossPlus");
  } else if (relativeToPar === -2) {
    label = t("player.eagle");
  } else if (relativeToPar === -1) {
    label = t("updates.scores.birdie");
  } else if (relativeToPar === 0) {
    label = t("updates.scores.par");
  } else if (relativeToPar === 1) {
    label = t("updates.scores.bogey");
  } else if (relativeToPar === 2) {
    label = t("player.doubleBogey");
  } else if (relativeToPar === 3) {
    label = t("updates.scores.tripleBogey");
  } else if (relativeToPar !== null && relativeToPar >= 4) {
    label = t("updates.scores.overPar", { strokes: relativeToPar });
  }
  const description = hole.outOfBounds
    ? `${label ? `${label}, ` : ""}${t("player.outOfBounds")}`
    : label;

  return (
    <td
      className="py-1.5 text-foreground dark:text-white"
      aria-label={
        hole.score !== null && description
          ? `${hole.score}, ${description}`
          : undefined
      }
      title={description ?? undefined}
    >
      {hole.score !== null && (background || hole.outOfBounds) ? (
        <span
          className={cn(
            "relative inline-flex h-7 min-w-7 items-center justify-center rounded-[3px] px-0.5 align-middle text-[#111827] dark:text-white",
            background,
          )}
        >
          {hole.score}
          {hole.outOfBounds ? (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 rounded-[1px] bg-background px-px text-[7px] font-bold leading-[9px] tracking-tight text-negative sm:-right-4 sm:top-1/2 sm:-translate-y-1/2 sm:bg-transparent sm:px-0 sm:text-[9px] sm:leading-none"
            >
              OB
            </span>
          ) : null}
        </span>
      ) : (
        (hole.score ?? "—")
      )}
    </td>
  );
}
