"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { FollowToggle } from "@/components/live/follow-toggle";
import { ScoreDisplay } from "@/components/live/score-display";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
import type { LeaderboardPlayer, PlayerRound } from "@/lib/types";
import { cn, formatDivisionRank, formatOverallRank } from "@/lib/utils";

function currentRound(rounds: PlayerRound[]) {
  return (
    [...rounds].reverse().find((round) => round.thru !== 0) ?? rounds.at(-1)
  );
}

function trendTone(value: number) {
  if (value < 0) return "bg-primary";
  if (value > 0) return "bg-negative";
  return "bg-muted/50";
}

function stableTrendKeys(values: number[], playerId: string) {
  const counts = new Map<number, number>();

  return values.map((value) => {
    const occurrence = (counts.get(value) ?? 0) + 1;
    counts.set(value, occurrence);

    return { key: `${playerId}-trend-${value}-${occurrence}`, value };
  });
}

function holeTone(relativeToPar: number | null) {
  if (relativeToPar === null || relativeToPar === 0) return "text-foreground";
  return relativeToPar < 0 ? "text-primary" : "text-negative";
}

export function LeaderboardCard({
  player,
  divisionPlayers,
  upcoming = false,
  showDivision,
  overallRank = false,
  followed,
  onFollowToggle,
  onSelect,
}: {
  player: LeaderboardPlayer;
  divisionPlayers: LeaderboardPlayer[];
  upcoming?: boolean;
  showDivision?: boolean;
  overallRank?: boolean;
  followed: boolean;
  onFollowToggle: () => void;
  onSelect: () => void;
}) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const round = currentRound(player.rounds ?? []);
  const roundStrokes = round?.holes.reduce(
    (sum, hole) => sum + (hole.score ?? 0),
    0,
  );
  const hasHoleData = Boolean(round?.holes.some((hole) => hole.score !== null));
  const holeRows = round?.holes.reduce<(typeof round.holes)[]>((rows, hole) => {
    const rowIndex = Math.floor((hole.hole - 1) / 9);
    rows[rowIndex] ??= [];
    rows[rowIndex].push(hole);
    return rows;
  }, []);
  const emptySlots = (holes: NonNullable<typeof holeRows>[number]) =>
    Array.from(
      { length: 9 - holes.length },
      (_, index) => holes.length + index + 1,
    );
  const detailId = `holes-${player.playerId}`;
  const playerNameContent = (
    <>
      <span className="block truncate text-sm font-medium text-foreground">
        {player.name}
      </span>
      {showDivision ? (
        <span className="block truncate text-[11px] text-muted">
          {translateDivisionLabel(player.division, locale)}
        </span>
      ) : null}
      {!upcoming ? (
        <span
          className="mt-1 flex items-center gap-1"
          role="img"
          aria-label={t("player.lastFiveHoles")}
        >
          {stableTrendKeys(player.lastFive.slice(-5), player.playerId).map(
            ({ key, value }) => (
              <span
                key={key}
                className={cn("h-1.5 w-1.5 rounded-full", trendTone(value))}
                aria-hidden="true"
              />
            ),
          )}
        </span>
      ) : null}
    </>
  );

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        {!upcoming ? (
          <td className="w-10 px-1 py-2 text-center font-display text-sm font-semibold sm:w-12 sm:px-3">
            {overallRank
              ? formatOverallRank(player, divisionPlayers)
              : formatDivisionRank(player, divisionPlayers)}
          </td>
        ) : null}
        <td className={cn("min-w-0 py-2 sm:px-3", upcoming && "pl-2")}>
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            {!upcoming ? (
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
            ) : null}
            {upcoming ? (
              <span className="min-w-0 flex-1 text-left">
                {playerNameContent}
              </span>
            ) : (
              <button
                type="button"
                onClick={onSelect}
                className="min-w-0 flex-1 text-left"
              >
                {playerNameContent}
              </button>
            )}
            {!upcoming ? (
              <FollowToggle
                active={followed}
                onToggle={onFollowToggle}
                className="h-7 w-7 sm:h-9 sm:w-9"
              />
            ) : null}
          </div>
        </td>
        {!upcoming ? (
          <>
            <td className="w-12 px-1 py-2 text-center text-sm font-semibold sm:w-14">
              <ScoreDisplay
                scoreToPar={player.scoreToPar}
                className="text-base"
              />
            </td>
            <td className="w-10 px-1 py-2 text-center text-sm text-foreground sm:w-12">
              {player.thru === "F" ? "F" : player.thru || "—"}
            </td>
            <td className="w-11 px-1 py-2 text-center text-sm font-semibold sm:w-12">
              {roundStrokes ? roundStrokes : "—"}
            </td>
          </>
        ) : null}
      </tr>
      {!upcoming && expanded ? (
        <tr id={detailId} className="border-b border-border bg-background/60">
          <td colSpan={5} className="px-3 py-2 sm:px-4">
            {hasHoleData ? (
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
                            <th
                              key={`h-${hole.hole}`}
                              className="py-1 font-medium"
                            >
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
                              className={cn(
                                "py-1",
                                holeTone(hole.relativeToPar),
                              )}
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
            ) : (
              <p className="py-1 text-center text-xs text-muted">
                {t("player.noRoundScores")}
              </p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
