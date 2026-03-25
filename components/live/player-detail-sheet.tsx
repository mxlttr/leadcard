"use client";

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
                  {player.division} · Rank #{player.rank} ·{" "}
                  {holeToLabel(player.thru)}
                </SheetDescription>
              </SheetHeader>

              <Card className="border-border bg-background shadow-none">
                <CardContent className="flex items-end justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">
                      Current score
                    </p>
                    <p
                      className={`score-text mt-2 text-4xl font-bold ${scoreTone(player.scoreToPar)}`}
                    >
                      {formatScore(player.scoreToPar)}
                    </p>
                  </div>
                  <div className="min-w-0 shrink-0 text-right text-sm text-muted">
                    <p className="truncate">{holeToLabel(player.thru)}</p>
                    <p className="mt-1 truncate">
                      Rank delta{" "}
                      {player.delta.rankDelta >= 0
                        ? `+${player.delta.rankDelta}`
                        : player.delta.rankDelta}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <section className="space-y-3">
                <div>
                  <h3 className="font-display text-base font-semibold">
                    Last five holes
                  </h3>
                  <p className="text-sm text-muted">
                    Most recent inferred hole-by-hole movement.
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {player.lastFive.map((value, index) => (
                    <div
                      key={`${player.playerId}-hole-${index}`}
                      className={`rounded-[18px] px-3 py-4 text-center score-text text-lg font-bold ${toneChip(value)}`}
                    >
                      {value === 0 ? "PAR" : value > 0 ? `+${value}` : value}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="font-display text-base font-semibold">
                    Recent updates
                  </h3>
                  <p className="text-sm text-muted">
                    Latest visible changes for this player.
                  </p>
                </div>
                <div className="space-y-3">
                  {playerUpdates.length === 0 ? (
                    <div className="rounded-[18px] border border-border bg-background px-4 py-4 text-sm text-muted">
                      No inferred update yet for this player in the current
                      session.
                    </div>
                  ) : (
                    playerUpdates.map((update, index) => (
                      <div
                        key={`${update.playerId}-${update.createdAt}-${index}`}
                        className="rounded-[18px] border border-border bg-background px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant={toneVariant(update.tone)}>
                            {update.tone}
                          </Badge>
                          <span className="text-xs text-muted">
                            {timestampLabel(update.createdAt)}
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
