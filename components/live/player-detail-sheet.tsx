"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
import type { LeaderboardPlayer, PlayerHoleScore, PlayerRound, RecentUpdate } from "@/lib/types";
import {
  formatDivisionRank,
  formatScore,
  holeToLabel,
  scoreTone,
  timestampLabel,
} from "@/lib/utils";
import { formatUpdateText } from "@/lib/update-copy";

function toneVariant(tone: RecentUpdate["tone"]) {
  if (tone === "positive") {
    return "primary";
  }

  if (tone === "negative") {
    return "negative";
  }

  return "default";
}

function holeScoreTone(hole: PlayerHoleScore) {
  if (hole.score === null) {
    return "border-border bg-surface/60 text-muted";
  }

  if (hole.relativeToPar === null || hole.relativeToPar === 0) {
    return "border-border bg-background text-foreground";
  }

  if (hole.relativeToPar < 0) {
    return "border-primary/30 bg-primary/10 text-primary";
  }

  return "border-negative/30 bg-negative/10 text-negative";
}

function activeRoundId(rounds: PlayerRound[]) {
  const currentRound =
    [...rounds]
      .reverse()
      .find((round) => round.thru !== 0) ?? rounds[rounds.length - 1];

  return currentRound?.id ?? "";
}

export function PlayerDetailSheet({
  player,
  divisionPlayers,
  updates,
  open,
  onOpenChange,
}: {
  player: LeaderboardPlayer | null;
  divisionPlayers: LeaderboardPlayer[];
  updates: RecentUpdate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale, t } = useI18n();
  const [openRoundId, setOpenRoundId] = useState("");
  const playerUpdates = player
    ? updates
        .filter((update) => update.playerId === player.playerId)
        .slice(0, 6)
    : [];
  const rounds = player?.rounds ?? [];
  const currentRoundId = activeRoundId(rounds);

  useEffect(() => {
    if (!player) {
      setOpenRoundId("");
      return;
    }

    setOpenRoundId(currentRoundId);
  }, [currentRoundId, player]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {player ? (
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="min-w-0 w-full space-y-5 pb-4 pr-4">
              <SheetHeader>
                <SheetTitle className="truncate pr-10">
                  {player.name}
                </SheetTitle>
                <SheetDescription className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {translateDivisionLabel(player.division, locale)} ·{" "}
                  {t("player.rankSummary", {
                    rank: formatDivisionRank(player, divisionPlayers),
                  })}{" "}
                  ·{" "}
                  {holeToLabel(player.thru, t)}
                </SheetDescription>
              </SheetHeader>

              <Card className="border-border bg-background shadow-none">
                <CardContent className="flex items-end justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      {t("player.currentScore")}
                    </p>
                    <p
                      className={`score-text mt-2 text-4xl font-bold ${scoreTone(player.scoreToPar)}`}
                    >
                      {formatScore(player.scoreToPar)}
                    </p>
                  </div>
                  <div className="min-w-0 shrink-0 text-right text-sm text-muted">
                    <p className="truncate">{holeToLabel(player.thru, t)}</p>
                    <p className="mt-1 truncate">
                      {t("player.rankDelta", {
                        value:
                          player.delta.rankDelta >= 0
                            ? `+${player.delta.rankDelta}`
                            : player.delta.rankDelta,
                      })}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <section className="space-y-3">
                <div>
                  <h3 className="font-display text-base font-semibold">
                    {t("player.roundScores")}
                  </h3>
                  <p className="text-sm text-muted">
                    {t("player.roundScoresDescription")}
                  </p>
                </div>
                {rounds.length === 0 ? (
                  <div className="rounded-[18px] border border-border bg-background px-4 py-4 text-sm text-muted">
                    {t("player.noRoundScores")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rounds.map((round) => {
                      const isOpen = round.id === openRoundId;

                      return (
                        <div
                          key={round.id}
                          className="overflow-hidden rounded-[18px] border border-border bg-background"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                            aria-expanded={isOpen}
                            aria-controls={`${round.id}-panel`}
                            onClick={() =>
                              setOpenRoundId((current) =>
                                current === round.id ? "" : round.id,
                              )
                            }
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-display text-sm font-semibold text-foreground">
                                  {t("player.roundLabel", {
                                    count: round.order,
                                  })}
                                </span>
                                {round.id === currentRoundId ? (
                                  <Badge
                                    className="normal-case tracking-normal"
                                    variant="default"
                                  >
                                    {t("player.currentRound")}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-muted">
                                {holeToLabel(round.thru, t)}
                                {round.scoreToPar !== null
                                  ? ` · ${formatScore(round.scoreToPar)}`
                                  : ""}
                              </p>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                                isOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          {isOpen ? (
                            <div
                              id={`${round.id}-panel`}
                              className="border-t border-border px-4 py-4"
                            >
                              <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [-webkit-overflow-scrolling:touch]">
                                <div className="inline-flex min-w-max gap-2">
                                  {round.holes.map((hole) => (
                                    <div
                                      key={`${round.id}-${hole.hole}`}
                                      className={`w-16 shrink-0 rounded-[16px] border px-2.5 py-3 text-center ${holeScoreTone(
                                        hole,
                                      )}`}
                                    >
                                      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                                        {hole.hole}
                                      </div>
                                      <div className="mt-1 text-[11px] text-muted">
                                        {t("player.parLabel", {
                                          par: hole.par ?? "—",
                                        })}
                                      </div>
                                      <div className="score-text mt-2 text-lg font-bold">
                                        {hole.score ?? "—"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="font-display text-base font-semibold">
                    {t("player.recentUpdates")}
                  </h3>
                  <p className="text-sm text-muted">
                    {t("player.recentUpdatesDescription")}
                  </p>
                </div>
                <div className="space-y-3">
                  {playerUpdates.length === 0 ? (
                    <div className="rounded-[18px] border border-border bg-background px-4 py-4 text-sm text-muted">
                      {t("player.noPlayerUpdate")}
                    </div>
                  ) : (
                    playerUpdates.map((update) => (
                      <div
                        key={`${update.playerId}-${update.createdAt}-${update.text}`}
                        className="rounded-[18px] border border-border bg-background px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant={toneVariant(update.tone)}>
                            {t(`updates.${update.tone}`)}
                          </Badge>
                          <span className="text-xs text-muted">
                            {timestampLabel(update.createdAt, locale)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                          {formatUpdateText(update, t)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
