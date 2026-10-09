"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { FollowToggle } from "@/components/live/follow-toggle";
import { ScoreDisplay } from "@/components/live/score-display";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
import type { LeaderboardPlayer, PlayerRound } from "@/lib/types";
import { cn, formatDivisionRank } from "@/lib/utils";

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
  followed,
  onFollowToggle,
  onSelect,
}: {
  player: LeaderboardPlayer;
  divisionPlayers: LeaderboardPlayer[];
  upcoming?: boolean;
  showDivision?: boolean;
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
  const detailId = `holes-${player.playerId}`;

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        {!upcoming ? (
          <td className="w-12 px-2 py-2 text-center font-display text-sm font-semibold sm:px-3">
            {formatDivisionRank(player, divisionPlayers)}
          </td>
        ) : null}
        <td className="min-w-0 px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2">
            {!upcoming ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={detailId}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${player.name} hole scores`}
                onClick={() => setExpanded((value) => !value)}
                className="flex h-7 w-6 shrink-0 items-center justify-center text-muted hover:text-foreground"
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSelect}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-medium text-foreground">
                {player.name}
              </span>
              {showDivision ? (
                <span className="block truncate text-[11px] text-muted">
                  {translateDivisionLabel(player.division, locale)}
                </span>
              ) : null}
            </button>
            {!upcoming ? (
              <div
                className="ml-1 hidden shrink-0 items-center gap-1 sm:flex"
                role="img"
                aria-label={t("player.lastFiveHoles")}
              >
                {stableTrendKeys(
                  player.lastFive.slice(-5),
                  player.playerId,
                ).map(({ key, value }) => (
                  <span
                    key={key}
                    className={cn("h-1.5 w-1.5 rounded-full", trendTone(value))}
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : null}
            {!upcoming ? (
              <FollowToggle active={followed} onToggle={onFollowToggle} />
            ) : null}
          </div>
        </td>
        {!upcoming ? (
          <>
            <td className="w-14 px-1 py-2 text-center text-sm font-semibold">
              <ScoreDisplay
                scoreToPar={player.scoreToPar}
                className="text-base"
              />
            </td>
            <td className="w-12 px-1 py-2 text-center text-sm text-foreground">
              {player.thru === "F" ? "F" : ""}
            </td>
            <td className="w-12 px-1 py-2 text-center text-sm font-semibold">
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
                    <tr className="text-muted">
                      <th className="w-12 py-1 text-left font-medium">
                        {t("player.hole")}
                      </th>
                      {round?.holes.map((hole) => (
                        <th key={`h-${hole.hole}`} className="py-1 font-medium">
                          {hole.hole}
                        </th>
                      ))}
                    </tr>
                    <tr className="text-muted">
                      <th className="py-1 text-left font-medium">
                        {t("player.par")}
                      </th>
                      {round?.holes.map((hole) => (
                        <td key={`p-${hole.hole}`} className="py-1">
                          {hole.par ?? "—"}
                        </td>
                      ))}
                    </tr>
                    <tr className="font-semibold">
                      <th className="py-1 text-left font-medium text-muted">
                        {t("player.score")}
                      </th>
                      {round?.holes.map((hole) => (
                        <td
                          key={`s-${hole.hole}`}
                          className={cn("py-1", holeTone(hole.relativeToPar))}
                        >
                          {hole.score ?? "—"}
                        </td>
                      ))}
                    </tr>
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
