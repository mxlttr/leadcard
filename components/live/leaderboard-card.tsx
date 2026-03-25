"use client";

import { Flame, TrendingDown, TrendingUp } from "lucide-react";

import { FollowToggle } from "@/components/live/follow-toggle";
import { RankDelta } from "@/components/live/rank-delta";
import { ScoreDisplay } from "@/components/live/score-display";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { LeaderboardPlayer } from "@/lib/types";
import { cn, holeToLabel } from "@/lib/utils";

function holeTone(value: number) {
  if (value < 0) {
    return "bg-primary";
  }

  if (value > 0) {
    return "bg-negative";
  }

  return "bg-muted/40";
}

function playerMomentum(player: LeaderboardPlayer) {
  const recentTotal = player.lastFive.reduce((sum, hole) => sum + hole, 0);

  if (recentTotal <= -2) {
    return (
      <Badge variant="primary" className="gap-1 normal-case tracking-normal">
        <Flame className="h-3 w-3" />
        Hot
      </Badge>
    );
  }

  if (recentTotal >= 2) {
    return (
      <Badge variant="negative" className="gap-1 normal-case tracking-normal">
        <TrendingDown className="h-3 w-3" />
        Sliding
      </Badge>
    );
  }

  return (
    <Badge className="gap-1 normal-case tracking-normal">
      <TrendingUp className="h-3 w-3" />
      Steady
    </Badge>
  );
}

export function LeaderboardCard({
  player,
  followed,
  onFollowToggle,
  onSelect,
}: {
  player: LeaderboardPlayer;
  followed: boolean;
  onFollowToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <Card className="border-border bg-surface shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onSelect}
            className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 text-left"
          >
            <span className="score-text text-xl font-bold text-foreground">
              #{player.rank}
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-foreground">
                {player.name}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-3 text-sm text-muted">
                <span className="shrink-0">
                  <RankDelta value={player.delta.rankDelta} />
                </span>
                <span className="truncate">{holeToLabel(player.thru)}</span>
              </div>
            </div>
            <ScoreDisplay scoreToPar={player.scoreToPar} className="shrink-0" />
          </button>
          <FollowToggle active={followed} onToggle={onFollowToggle} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {player.lastFive.map((hole, index) => (
              <span
                key={`${player.playerId}-${index}`}
                className={cn("h-3.5 w-3.5 rounded-full", holeTone(hole))}
                aria-hidden="true"
              />
            ))}
          </div>
          {playerMomentum(player)}
        </div>

        <p className="text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {player.latestUpdate?.text ??
            `Holding ${holeToLabel(player.thru).toLowerCase()}`}
        </p>
      </CardContent>
    </Card>
  );
}
