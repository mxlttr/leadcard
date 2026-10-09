"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { LeaderboardPlayer } from "@/lib/types";
import { cn } from "@/lib/utils";

function currentRound(player: LeaderboardPlayer) {
  const rounds = player.rounds ?? [];
  return (
    [...rounds].reverse().find((round) => round.thru !== 0) ?? rounds.at(-1)
  );
}

function holeTone(relativeToPar: number | null) {
  if (relativeToPar === null || relativeToPar === 0) return "text-foreground";
  return relativeToPar < 0 ? "text-primary" : "text-negative";
}

export function CompactScorecard({ player }: { player: LeaderboardPlayer }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const round = currentRound(player);
  const holeRows = round?.holes.reduce<(typeof round.holes)[]>((rows, hole) => {
    const rowIndex = Math.floor((hole.hole - 1) / 9);
    rows[rowIndex] ??= [];
    rows[rowIndex].push(hole);
    return rows;
  }, []);
  const hasHoleData = Boolean(round?.holes.some((hole) => hole.score !== null));
  const detailId = `holes-${player.playerId}`;
  const emptySlots = (holes: NonNullable<typeof holeRows>[number]) =>
    Array.from(
      { length: 9 - holes.length },
      (_, index) => holes.length + index + 1,
    );

  if (!hasHoleData) return null;

  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${player.name} hole scores`}
        onClick={() => setExpanded((value) => !value)}
        className="flex h-7 w-5 shrink-0 items-center justify-center text-muted hover:text-foreground sm:w-7"
      >
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {expanded ? (
        <div
          id={detailId}
          className="w-full basis-full border-t border-border bg-background/60 px-2 py-2"
        >
          <div className="overflow-x-auto">
            <table className="mx-auto w-full max-w-2xl table-fixed text-center text-xs">
              <tbody>
                {holeRows?.map((holes, rowIndex) => (
                  <Fragment key={`hole-row-${holes[0]?.hole}`}>
                    <tr
                      className={cn(
                        "text-muted",
                        rowIndex > 0 &&
                          "border-t border-border [&>th]:pt-3 [&>td]:pt-3",
                      )}
                    >
                      <th className="w-12 py-1 text-left font-medium">
                        {t("player.hole")}
                      </th>
                      {holes.map((hole) => (
                        <th key={`h-${hole.hole}`} className="py-1 font-medium">
                          {hole.hole}
                        </th>
                      ))}
                      {emptySlots(holes).map((slot) => (
                        <td key={`hole-empty-${holes[0]?.hole}-${slot}`} />
                      ))}
                    </tr>
                    <tr className="text-muted">
                      <th className="py-1 text-left font-medium">
                        {t("player.par")}
                      </th>
                      {holes.map((hole) => (
                        <td key={`p-${hole.hole}`} className="py-1">
                          {hole.par ?? "—"}
                        </td>
                      ))}
                      {emptySlots(holes).map((slot) => (
                        <td key={`par-empty-${holes[0]?.hole}-${slot}`} />
                      ))}
                    </tr>
                    <tr className="font-semibold">
                      <th className="py-1 text-left font-medium text-muted">
                        {t("player.score")}
                      </th>
                      {holes.map((hole) => (
                        <td
                          key={`s-${hole.hole}`}
                          className={cn("py-1", holeTone(hole.relativeToPar))}
                        >
                          {hole.score ?? "—"}
                        </td>
                      ))}
                      {emptySlots(holes).map((slot) => (
                        <td key={`score-empty-${holes[0]?.hole}-${slot}`} />
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
