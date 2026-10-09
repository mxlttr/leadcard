"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { ScoreDisplay } from "@/components/live/score-display";
import { Card, CardContent } from "@/components/ui/card";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
import type { LeaderboardPlayer, LiveResponse } from "@/lib/types";
import {
  formatRelativeTime,
  formatScore,
  isStartingListStatus,
} from "@/lib/utils";

export function GlobalSnapshot({
  data,
  onSelectPlayer,
}: {
  data: LiveResponse;
  onSelectPlayer?: (player: LeaderboardPlayer) => void;
}) {
  const { locale, t } = useI18n();
  const [showAllDivisionLeaders, setShowAllDivisionLeaders] = useState(false);
  const overallLeader = data.leaders[0];
  const noLiveData = !data.hasLiveData;
  const visibleDivisionLeaders = showAllDivisionLeaders
    ? data.divisionLeaders
    : data.divisionLeaders.slice(0, 3);

  return (
    <Card className="border-border bg-surface shadow-none">
      <CardContent className="space-y-5 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            {t("snapshot.heading")}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {data.tournament.name}
          </h2>
          <p className="mt-2 truncate text-sm text-muted">
            {data.tournament.course}
          </p>
          {noLiveData ? (
            <p className="mt-1 text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {t("snapshot.liveScoringNotAvailableYet", {
                roundLabel: data.tournament.roundLabel,
              })}
            </p>
          ) : data.tournament.status === "live" ? (
            <p className="mt-1 text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {t("snapshot.latestUpdate", {
                roundLabel: data.tournament.roundLabel,
                time: formatRelativeTime(data.generatedAt, locale),
              })}
            </p>
          ) : null}
        </div>

        {noLiveData && (
          <div
            id="live-scoring-status"
            className="rounded-[20px] border border-border bg-background p-4 text-sm text-muted"
          >
            {data.tournament.status === "upcoming" ||
            data.tournament.status === "tomorrow"
              ? t("snapshot.upcomingMessage")
              : t("snapshot.unavailableMessage")}
          </div>
        )}

        {!isStartingListStatus(data.tournament.status) ? (
          <div id="division-leaders" className="grid gap-3">
            {visibleDivisionLeaders.map(({ division, leader }) => {
              const gap = overallLeader
                ? leader.scoreToPar - overallLeader.scoreToPar
                : 0;

              return (
                <button
                  type="button"
                  key={division}
                  className="flex w-full items-center justify-between rounded-[18px] border border-border bg-background px-4 py-3 text-left"
                  onClick={() => onSelectPlayer?.(leader)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs uppercase tracking-[0.18em] text-muted">
                      {t("snapshot.divisionLeader", {
                        division: translateDivisionLabel(division, locale),
                      })}
                    </p>
                    <p className="mt-1 truncate font-medium">{leader.name}</p>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <ScoreDisplay
                      scoreToPar={leader.scoreToPar}
                      className="text-2xl"
                    />
                    <p className="mt-1 text-xs text-muted">
                      {gap === 0
                        ? t(
                            leader.playerId === overallLeader?.playerId
                              ? "snapshot.overallLeader"
                              : "snapshot.tiedOverall",
                          )
                        : t("snapshot.toOverallLead", {
                            score: formatScore(gap),
                          })}
                    </p>
                  </div>
                </button>
              );
            })}
            {data.divisionLeaders.length > 3 ? (
              <button
                type="button"
                className="rounded-[18px] border border-border px-4 py-3 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground"
                onClick={() => setShowAllDivisionLeaders((visible) => !visible)}
              >
                {showAllDivisionLeaders
                  ? t("snapshot.showFewerDivisions")
                  : t("snapshot.showMoreDivisions", {
                      count: data.divisionLeaders.length - 3,
                    })}
              </button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
