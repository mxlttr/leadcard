"use client";

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
import type { LeaderboardPlayer, RecentUpdate } from "@/lib/types";
import {
  formatScore,
  holeToLabel,
  scoreTone,
  timestampLabel,
} from "@/lib/utils";

function toneChip(value: number) {
  if (value < 0) {
    return "bg-primary text-background";
  }

  if (value > 0) {
    return "bg-negative text-white";
  }

  return "bg-background text-muted";
}

function toneVariant(tone: RecentUpdate["tone"]) {
  if (tone === "positive") {
    return "primary";
  }

  if (tone === "negative") {
    return "negative";
  }

  return "default";
}

export function PlayerDetailSheet({
  player,
  updates,
  open,
  onOpenChange,
}: {
  player: LeaderboardPlayer | null;
  updates: RecentUpdate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale, t } = useI18n();
  const playerUpdates = player
    ? updates
        .filter((update) => update.playerId === player.playerId)
        .slice(0, 6)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {player ? (
          <ScrollArea className="max-h-[78vh] pr-1">
            <div className="space-y-5 pb-4 pr-4">
              <SheetHeader>
                <SheetTitle className="truncate pr-10">
                  {player.name}
                </SheetTitle>
                <SheetDescription className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {translateDivisionLabel(player.division, locale)} ·{" "}
                  {t("player.rankSummary", { rank: player.rank })} ·{" "}
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
                    {t("player.lastFiveHoles")}
                  </h3>
                  <p className="text-sm text-muted">
                    {t("player.lastFiveDescription")}
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {player.lastFive.map((value, index) => (
                    <div
                      key={`${player.playerId}-hole-${index}`}
                      className={`rounded-[18px] px-3 py-4 text-center score-text text-lg font-bold ${toneChip(value)}`}
                    >
                      {value === 0
                        ? t("player.par")
                        : value > 0
                          ? `+${value}`
                          : value}
                    </div>
                  ))}
                </div>
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
                    playerUpdates.map((update, index) => (
                      <div
                        key={`${update.playerId}-${update.createdAt}-${index}`}
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
                          {update.text}
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
