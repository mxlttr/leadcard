"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  MonitorPlay,
  Moon,
  Pause,
  Play,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { MockReplayPanel } from "@/components/live/mock-replay-panel";
import { RankDelta } from "@/components/live/rank-delta";
import { ScoreDisplay } from "@/components/live/score-display";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type AppLocale, type Dictionary, locales } from "@/lib/i18n";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  LiveResponse,
  PlayerHoleScore,
} from "@/lib/types";
import {
  cn,
  formatRelativeTime,
  holeToLabel,
  timestampLabel,
} from "@/lib/utils";

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return (await response.json()) as T;
}

function parseIntervalSeconds(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(60, Math.max(5, Math.round(parsed)));
}

function parsePlayersPerPage(value: string | null) {
  if (value === "all") {
    return -1;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 8;
  }

  return Math.min(30, Math.max(4, Math.round(parsed)));
}

function boardRotationProgress(
  nextSwitchAt: number,
  intervalMs: number,
  now: number,
) {
  if (intervalMs <= 0) {
    return 0;
  }

  const remainingMs = Math.max(0, nextSwitchAt - now);
  return Math.max(0, Math.min(1, remainingMs / intervalMs));
}

function LoadingBoard() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 rounded-[28px]" />
      <Skeleton className="h-[70vh] rounded-[28px]" />
    </div>
  );
}

function boardStatusLabel(
  status: LiveResponse["tournament"]["status"],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return t(`tournaments.status.${status}`);
}

function boardStatusClass(status: LiveResponse["tournament"]["status"]) {
  if (status === "live") {
    return "text-negative";
  }

  if (status === "today" || status === "tomorrow") {
    return "text-primary";
  }

  return "text-muted";
}

function tournamentRoundSummary(
  tournament: LiveResponse["tournament"],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (
    tournament.currentRound &&
    tournament.totalRounds &&
    tournament.totalRounds >= tournament.currentRound
  ) {
    return t("tournaments.roundProgress", {
      current: tournament.currentRound,
      total: tournament.totalRounds,
    });
  }

  return tournament.roundLabel;
}

function languageHref(locale: AppLocale, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `/${locale}/board?${query}` : `/${locale}/board`;
}

function latestPlayedHoles(player: LeaderboardPlayer) {
  const rounds = player.rounds ?? [];
  const currentRound =
    [...rounds].reverse().find((round) => round.thru !== 0) ??
    rounds[rounds.length - 1];

  if (!currentRound) {
    return [] as PlayerHoleScore[];
  }

  return currentRound.holes.filter((hole) => hole.score !== null).slice(-9);
}

function boardHoleTone(hole: PlayerHoleScore) {
  if (hole.relativeToPar === null || hole.relativeToPar === 0) {
    return "border-border bg-background text-foreground";
  }

  if (hole.relativeToPar < 0) {
    return hole.relativeToPar <= -2
      ? "border-primary/60 bg-primary/15 text-primary ring-1 ring-primary/40"
      : "border-primary/30 bg-primary/10 text-primary";
  }

  return hole.relativeToPar >= 2
    ? "border-negative/60 bg-negative/15 text-negative ring-1 ring-negative/40"
    : "border-negative/30 bg-negative/10 text-negative";
}

function holeScoreLabel(hole: PlayerHoleScore, t: (key: string) => string) {
  if (hole.score === 1) {
    return t("player.ace");
  }

  if (hole.relativeToPar !== null && hole.relativeToPar <= -3) {
    return t("player.albatrossPlus");
  }

  if (hole.relativeToPar === -2) {
    return t("player.eagle");
  }

  if (hole.relativeToPar === 2) {
    return t("player.doubleBogey");
  }

  if (hole.relativeToPar !== null && hole.relativeToPar >= 3) {
    return t("player.doubleBogeyPlus");
  }

  return null;
}

function formatRelativeHoleScore(relativeToPar: number | null) {
  if (relativeToPar === null || relativeToPar === 0) {
    return "E";
  }

  return relativeToPar > 0 ? `+${relativeToPar}` : `${relativeToPar}`;
}

function isAllPlayersMode(playersPerPage: number) {
  return playersPerPage === -1;
}

const boardSelectClass =
  "flex h-10 w-full rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function BoardHeader({
  locale,
  searchParams,
  liveData,
  tournaments,
  selectedTournamentId,
  activeDivision,
  rotationEnabled,
  rotationPaused,
  intervalSeconds,
  remainingSeconds,
  fullscreenEnabled,
  fullscreenActive,
  settingsOpen,
  onToggleFullscreen,
  onSelectTournament,
  onToggleSettings,
  onToggleRotation,
  onPreviousDivision,
  onNextDivision,
}: {
  locale: AppLocale;
  searchParams: URLSearchParams;
  liveData: LiveResponse;
  tournaments: LiveResponse["tournaments"];
  selectedTournamentId: string;
  activeDivision: string;
  rotationEnabled: boolean;
  rotationPaused: boolean;
  intervalSeconds: number;
  remainingSeconds: number;
  fullscreenEnabled: boolean;
  fullscreenActive: boolean;
  settingsOpen: boolean;
  onToggleFullscreen: () => void;
  onSelectTournament: (tournamentId: string) => void;
  onToggleSettings: () => void;
  onToggleRotation: () => void;
  onPreviousDivision: () => void;
  onNextDivision: () => void;
}) {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <Card className="border-border bg-surface">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
                {t("app.name")}
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]",
                  boardStatusClass(liveData.tournament.status),
                )}
              >
                {liveData.tournament.status === "live" ? (
                  <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-negative/70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-negative" />
                  </span>
                ) : null}
                {boardStatusLabel(liveData.tournament.status, t)}
              </span>
            </div>

            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl xl:text-5xl">
              {liveData.tournament.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span>{liveData.tournament.course}</span>
              <span>{tournamentRoundSummary(liveData.tournament, t)}</span>
              <span>
                {liveData.hasLiveData
                  ? t("board.latestSnapshot", {
                      time: formatRelativeTime(liveData.generatedAt, locale),
                    })
                  : t("board.waitingForLiveData")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav
              className="flex items-center gap-1 rounded-full border border-border bg-surface p-1"
              aria-label={t("language.switcherLabel")}
            >
              {locales.map((item) => {
                const active = item === locale;

                return (
                  <Link
                    key={item}
                    href={languageHref(item, searchParams)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] transition-colors",
                      active
                        ? "bg-background text-foreground"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {item}
                  </Link>
                );
              })}
            </nav>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border border-border p-0"
              onClick={onToggleFullscreen}
              aria-label={
                fullscreenActive
                  ? t("board.exitFullscreen")
                  : t("board.enterFullscreen")
              }
              title={
                fullscreenActive
                  ? t("board.exitFullscreen")
                  : t("board.enterFullscreen")
              }
              disabled={!fullscreenEnabled}
            >
              {fullscreenActive ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border border-border p-0"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? t("theme.switchToLight")
                  : t("theme.switchToDark")
              }
              title={
                theme === "dark"
                  ? t("theme.switchToLight")
                  : t("theme.switchToDark")
              }
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="min-w-0 w-full sm:max-w-[min(100%,28rem)]">
              <span className="sr-only">{t("board.fields.tournament")}</span>
              <select
                value={selectedTournamentId}
                onChange={(event) => onSelectTournament(event.target.value)}
                className={cn(
                  boardSelectClass,
                  "min-w-0 max-w-full truncate pr-10",
                )}
                aria-label={t("board.fields.tournament")}
                title={
                  tournaments.find(
                    (tournament) => tournament.id === selectedTournamentId,
                  )?.name ?? ""
                }
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span className="min-w-0 truncate">
                {t("board.currentDivision")}:{" "}
                <span className="font-medium text-foreground">
                  {translateDivisionLabel(activeDivision, locale)}
                </span>
              </span>
              <span className="min-w-0 truncate">
                {t("board.updatedAt")}:{" "}
                <span className="font-medium text-foreground">
                  {timestampLabel(liveData.generatedAt, locale)}
                </span>
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-10 shrink-0 self-start rounded-full border border-border px-4 sm:self-auto"
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
            aria-controls="board-settings-panel"
          >
            {t("board.settings")}
            <ChevronDown
              className={cn(
                "ml-2 h-4 w-4 transition-transform",
                settingsOpen ? "rotate-180" : "",
              )}
            />
          </Button>
        </div>

        {settingsOpen ? (
          <div
            id="board-settings-panel"
            className="grid gap-3 border-t border-border pt-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end"
          >
            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
              <div className="rounded-[20px] border border-border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  {t("board.currentDivision")}
                </p>
                <p className="mt-2 truncate font-display text-2xl font-semibold">
                  {translateDivisionLabel(activeDivision, locale)}
                </p>
              </div>
              <div className="rounded-[20px] border border-border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  {t("board.rotation")}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {rotationEnabled
                    ? rotationPaused
                      ? t("board.rotationPaused")
                      : t("board.rotationEvery", { seconds: intervalSeconds })
                    : t("board.rotationLocked")}
                </p>
              </div>
              <div className="rounded-[20px] border border-border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  {t("board.nextSwitch")}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {rotationEnabled && !rotationPaused
                    ? t("board.inSeconds", { seconds: remainingSeconds })
                    : t("board.manualControl")}
                </p>
              </div>
              <div className="rounded-[20px] border border-border bg-background px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">
                  {t("board.updatedAt")}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {timestampLabel(liveData.generatedAt, locale)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-full border border-border px-4"
                onClick={onPreviousDivision}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("board.previous")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-full border border-border px-4"
                onClick={onToggleRotation}
              >
                {rotationPaused ? (
                  <Play className="mr-1 h-4 w-4" />
                ) : (
                  <Pause className="mr-1 h-4 w-4" />
                )}
                {rotationPaused ? t("board.resume") : t("board.pause")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-full border border-border px-4"
                onClick={onNextDivision}
              >
                {t("board.next")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BoardSettings({
  tournaments,
  liveData,
  selectedTournamentId,
  selectedDivision,
  rotationEnabled,
  intervalSeconds,
  playersPerPage,
  onSelectTournament,
  onSelectDivision,
  onSetRotationEnabled,
  onSetIntervalSeconds,
  onSetPlayersPerPage,
}: {
  tournaments: LiveResponse["tournaments"];
  liveData: LiveResponse;
  selectedTournamentId: string;
  selectedDivision: string;
  rotationEnabled: boolean;
  intervalSeconds: number;
  playersPerPage: number;
  onSelectTournament: (tournamentId: string) => void;
  onSelectDivision: (division: string) => void;
  onSetRotationEnabled: (enabled: boolean) => void;
  onSetIntervalSeconds: (seconds: number) => void;
  onSetPlayersPerPage: (count: number) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <Card className="border-border bg-surface">
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            {t("board.settings")}
          </p>
          <p className="mt-1 text-sm text-muted">{t("board.tournamentHint")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.fields.tournament")}
            </span>
            <select
              value={selectedTournamentId}
              onChange={(event) => onSelectTournament(event.target.value)}
              className={boardSelectClass}
            >
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.fields.division")}
            </span>
            <select
              value={selectedDivision}
              onChange={(event) => onSelectDivision(event.target.value)}
              className={boardSelectClass}
            >
              <option value="">{t("board.allDivisions")}</option>
              {liveData.divisions.map((division) => (
                <option key={division} value={division}>
                  {translateDivisionLabel(division, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.fields.interval")}
            </span>
            <select
              value={String(intervalSeconds)}
              onChange={(event) =>
                onSetIntervalSeconds(Number(event.target.value))
              }
              className={boardSelectClass}
            >
              {[5, 10, 15, 20, 30].map((value) => (
                <option key={value} value={value}>
                  {t("board.rotationEvery", { seconds: value })}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.fields.players")}
            </span>
            <select
              value={String(playersPerPage)}
              onChange={(event) =>
                onSetPlayersPerPage(
                  event.target.value === "all"
                    ? -1
                    : Number(event.target.value),
                )
              }
              className={boardSelectClass}
            >
              {["all", 6, 8, 10, 12, 15, 20].map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? t("board.allPlayers")
                    : t("board.playersPerPage", { count: value })}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[20px] border border-border bg-background px-4 py-3">
            <span className="block text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.fields.autorotate")}
            </span>
            <span className="mt-1 block text-sm text-foreground">
              {selectedDivision
                ? t("board.rotationLocked")
                : rotationEnabled
                  ? t("board.rotationEvery", { seconds: intervalSeconds })
                  : t("board.manualControl")}
            </span>
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                variant={
                  rotationEnabled && !selectedDivision ? "default" : "ghost"
                }
                className={cn(
                  "h-10 rounded-full px-4",
                  !rotationEnabled || selectedDivision
                    ? "border border-border"
                    : "",
                )}
                onClick={() => onSetRotationEnabled(true)}
                disabled={Boolean(selectedDivision)}
              >
                {t("board.on")}
              </Button>
              <Button
                type="button"
                variant={
                  !rotationEnabled || selectedDivision ? "default" : "ghost"
                }
                className={cn(
                  "h-10 rounded-full px-4",
                  rotationEnabled && !selectedDivision
                    ? "border border-border"
                    : "",
                )}
                onClick={() => onSetRotationEnabled(false)}
              >
                {t("board.off")}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BoardTable({
  division,
  players,
  pageIndex,
  totalPages,
  totalPlayers,
}: {
  division: string;
  players: LeaderboardPlayer[];
  pageIndex: number;
  totalPages: number;
  totalPlayers: number;
}) {
  const { locale, t } = useI18n();

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 border-border bg-surface">
      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-0">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.fullBoard")}
            </p>
            <h2 className="mt-2 truncate font-display text-2xl font-semibold sm:text-3xl">
              {translateDivisionLabel(division, locale)}
            </h2>
            {totalPages > 1 ? (
              <p className="mt-2 text-sm text-muted">
                {t("board.page", {
                  current: pageIndex + 1,
                  total: totalPages,
                })}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {t("board.players")}
            </p>
            <p className="mt-2 text-2xl font-semibold">{totalPlayers}</p>
          </div>
        </div>

        <div className="hidden min-h-0 overflow-auto sm:block">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted">
                <th className="border-b border-border px-5 py-3 font-medium sm:px-6">
                  {t("board.columns.rank")}
                </th>
                <th className="border-b border-border px-5 py-3 font-medium sm:px-6">
                  {t("board.columns.player")}
                </th>
                <th className="border-b border-border px-5 py-3 font-medium sm:px-6">
                  {t("board.columns.delta")}
                </th>
                <th className="border-b border-border px-5 py-3 font-medium sm:px-6">
                  {t("board.columns.score")}
                </th>
                <th className="border-b border-border px-5 py-3 font-medium sm:px-6">
                  {t("board.columns.thru")}
                </th>
                <th className="border-b border-border px-5 py-3 font-medium sm:px-6">
                  {t("board.columns.lastNine")}
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const recentHoles = latestPlayedHoles(player);

                return (
                  <tr key={player.playerId} className="align-middle">
                    <td className="border-b border-border px-5 py-4 sm:px-6">
                      <span className="font-display text-2xl font-semibold">
                        #{player.rank}
                      </span>
                    </td>
                    <td className="border-b border-border px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <div className="truncate font-body text-lg font-medium text-foreground">
                          {player.name}
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {translateDivisionLabel(player.division, locale)}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border px-5 py-4 sm:px-6">
                      <RankDelta value={player.delta.rankDelta} />
                    </td>
                    <td className="border-b border-border px-5 py-4 sm:px-6">
                      <ScoreDisplay
                        scoreToPar={player.scoreToPar}
                        className="text-3xl"
                      />
                    </td>
                    <td className="border-b border-border px-5 py-4 sm:px-6">
                      <span className="text-base text-foreground">
                        {holeToLabel(player.thru, t)}
                      </span>
                    </td>
                    <td className="border-b border-border px-5 py-4 sm:px-6">
                      {recentHoles.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {recentHoles.map((hole) => (
                            <div
                              key={`${player.playerId}-board-hole-${hole.hole}`}
                              className={cn(
                                "w-14 rounded-[14px] border px-2 py-2 text-center",
                                boardHoleTone(hole),
                              )}
                            >
                              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                                {t("board.holeNumber", { hole: hole.hole })}
                              </div>
                              <div className="score-text mt-1 text-base font-bold">
                                {formatRelativeHoleScore(hole.relativeToPar)}
                              </div>
                              {holeScoreLabel(hole, t) ? (
                                <div className="mt-1 text-[8px] font-bold uppercase tracking-wide">
                                  {holeScoreLabel(hole, t)}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted">
                          {t("board.noHoleData")}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 sm:hidden">
          {players.map((player) => {
            const recentHoles = latestPlayedHoles(player);

            return (
              <article
                key={player.playerId}
                className="min-w-0 rounded-[20px] border border-border bg-background p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-display text-xl font-semibold">
                    #{player.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {player.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {translateDivisionLabel(player.division, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <ScoreDisplay
                      scoreToPar={player.scoreToPar}
                      className="text-2xl"
                    />
                    <p className="mt-0.5 text-xs text-muted">
                      {holeToLabel(player.thru, t)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <RankDelta value={player.delta.rankDelta} />
                  </div>
                </div>
                {recentHoles.length > 0 ? (
                  <div className="mt-3 flex min-w-0 gap-1.5 overflow-x-auto pb-1">
                    {recentHoles.map((hole) => (
                      <div
                        key={`${player.playerId}-mobile-board-hole-${hole.hole}`}
                        className={cn(
                          "w-10 shrink-0 rounded-[12px] border px-1 py-1.5 text-center",
                          boardHoleTone(hole),
                        )}
                      >
                        <div className="text-[9px] font-medium uppercase text-muted">
                          {t("board.holeNumber", { hole: hole.hole })}
                        </div>
                        <div className="score-text mt-0.5 text-sm font-bold">
                          {formatRelativeHoleScore(hole.relativeToPar)}
                        </div>
                        {holeScoreLabel(hole, t) ? (
                          <div className="mt-0.5 text-[7px] font-bold uppercase leading-tight tracking-wide">
                            {holeScoreLabel(hole, t)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    {t("board.noHoleData")}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function LiveBoardContent({ locale }: { locale: AppLocale }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTournamentId = searchParams.get("tournamentId") ?? "";
  const lockedDivision = searchParams.get("division") ?? "";
  const rotationEnabled =
    searchParams.get("rotate") !== "false" && !lockedDivision;
  const intervalSeconds = parseIntervalSeconds(searchParams.get("interval"));
  const playersPerPage = parsePlayersPerPage(searchParams.get("players"));
  const intervalMs = intervalSeconds * 1000;
  const [rotationPaused, setRotationPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDivision, setActiveDivision] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [nextSwitchAt, setNextSwitchAt] = useState(
    () => Date.now() + intervalMs,
  );
  const [now, setNow] = useState(() => Date.now());
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);
  const stepBoardRef = useRef<(direction: -1 | 1) => void>(() => undefined);
  const rotateStepRef = useRef<(direction: -1 | 1) => void>(() => undefined);

  const liveQuery = useQuery({
    queryKey: ["board-live", locale, requestedTournamentId || "default"],
    queryFn: () =>
      fetchJson<LiveResponse>(
        requestedTournamentId
          ? `/api/live?tournamentId=${encodeURIComponent(requestedTournamentId)}`
          : "/api/live",
      ),
    refetchInterval: (query) => {
      const interval = (query.state.data as LiveResponse | undefined)
        ?.updateIntervalMs;
      return interval && interval > 0 ? interval : false;
    },
    placeholderData: keepPreviousData,
  });

  const liveData = liveQuery.data;
  const selectedTournamentId =
    requestedTournamentId || liveData?.tournament.id || "";

  const leaderboardQueries = useQueries({
    queries: (liveData?.divisions ?? []).map((division) => ({
      queryKey: ["board-leaderboard", locale, selectedTournamentId, division],
      queryFn: () =>
        fetchJson<LeaderboardResponse>(
          `/api/leaderboard?tournamentId=${encodeURIComponent(selectedTournamentId)}&division=${encodeURIComponent(division)}`,
        ),
      enabled: Boolean(selectedTournamentId),
      refetchInterval:
        liveData && liveData.updateIntervalMs > 0
          ? liveData.updateIntervalMs
          : false,
      placeholderData: keepPreviousData,
    })),
  });

  const leaderboardsByDivision = useMemo(() => {
    const entries: Array<[string, LeaderboardResponse | null]> = (
      liveData?.divisions ?? []
    ).map((division, index) => [
      division,
      leaderboardQueries[index]?.data ?? null,
    ]);

    return new Map(entries);
  }, [leaderboardQueries, liveData?.divisions]);

  stepBoardRef.current = (direction: -1 | 1) => {
    const currentDivisionLeaderboard =
      leaderboardsByDivision.get(activeDivision);

    if (!currentDivisionLeaderboard || !liveData) {
      return;
    }

    const currentPlayersPerPage = isAllPlayersMode(playersPerPage)
      ? Math.max(1, currentDivisionLeaderboard.players.length)
      : playersPerPage;
    const currentTotalPages = Math.max(
      1,
      Math.ceil(
        currentDivisionLeaderboard.players.length / currentPlayersPerPage,
      ),
    );
    const currentSafePageIndex = Math.min(pageIndex, currentTotalPages - 1);

    if (direction > 0) {
      if (currentSafePageIndex < currentTotalPages - 1) {
        setPageIndex(currentSafePageIndex + 1);
        return;
      }
    } else if (currentSafePageIndex > 0) {
      setPageIndex(currentSafePageIndex - 1);
      return;
    }

    if (!liveData.divisions.length) {
      return;
    }

    const currentDivisionIndex = liveData.divisions.indexOf(activeDivision);
    const nextDivisionIndex =
      currentDivisionIndex >= 0
        ? (currentDivisionIndex + direction + liveData.divisions.length) %
          liveData.divisions.length
        : 0;
    const nextDivision =
      liveData.divisions[nextDivisionIndex] ?? liveData.divisions[0];
    const nextDivisionLeaderboard = leaderboardsByDivision.get(nextDivision);

    if (!nextDivisionLeaderboard) {
      return;
    }

    const nextDivisionTotalPages = Math.max(
      1,
      Math.ceil(nextDivisionLeaderboard.players.length / currentPlayersPerPage),
    );

    setActiveDivision(nextDivision);
    setPageIndex(direction > 0 ? 0 : nextDivisionTotalPages - 1);
  };

  rotateStepRef.current = (direction: -1 | 1) => {
    stepBoardRef.current(direction);
    setNextSwitchAt(Date.now() + intervalMs);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setFullscreenEnabled(Boolean(document.documentElement.requestFullscreen));

    function syncFullscreenState() {
      setFullscreenActive(Boolean(document.fullscreenElement));
    }

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    setNextSwitchAt(Date.now() + intervalMs);
  }, [intervalMs]);

  useEffect(() => {
    setPageIndex(0);
  }, []);

  useEffect(() => {
    if (!liveData) {
      return;
    }

    const validDivision = liveData.divisions.includes(lockedDivision)
      ? lockedDivision
      : "";

    if (validDivision) {
      setActiveDivision(validDivision);
      return;
    }

    if (!activeDivision || !liveData.divisions.includes(activeDivision)) {
      setActiveDivision(liveData.divisions[0] ?? "");
    }
  }, [activeDivision, liveData, lockedDivision]);

  useEffect(() => {
    if (
      !rotationEnabled ||
      rotationPaused ||
      !liveData ||
      !activeDivision ||
      now < nextSwitchAt
    ) {
      return;
    }
    rotateStepRef.current(1);
  }, [
    activeDivision,
    liveData,
    nextSwitchAt,
    now,
    rotationEnabled,
    rotationPaused,
  ]);

  if (!liveData) {
    return <LoadingBoard />;
  }

  if (!liveData.divisions.length) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-4">
        <BoardHeader
          locale={locale}
          searchParams={new URLSearchParams(searchParams.toString())}
          liveData={liveData}
          tournaments={liveData.tournaments}
          selectedTournamentId={selectedTournamentId}
          activeDivision={t("board.noDivision")}
          rotationEnabled={false}
          rotationPaused={true}
          intervalSeconds={intervalSeconds}
          remainingSeconds={0}
          fullscreenEnabled={fullscreenEnabled}
          fullscreenActive={fullscreenActive}
          settingsOpen={settingsOpen}
          onToggleFullscreen={toggleFullscreen}
          onSelectTournament={syncTournamentUrl}
          onToggleSettings={() => setSettingsOpen((value) => !value)}
          onToggleRotation={() => undefined}
          onPreviousDivision={() => undefined}
          onNextDivision={() => undefined}
        />
        {settingsOpen ? (
          <BoardSettings
            liveData={liveData}
            tournaments={liveData.tournaments}
            selectedTournamentId={selectedTournamentId}
            selectedDivision={lockedDivision}
            rotationEnabled={rotationEnabled}
            intervalSeconds={intervalSeconds}
            playersPerPage={playersPerPage}
            onSelectTournament={syncTournamentUrl}
            onSelectDivision={syncDivisionSetting}
            onSetRotationEnabled={syncRotationSetting}
            onSetIntervalSeconds={syncIntervalSetting}
            onSetPlayersPerPage={syncPlayersPerPageSetting}
          />
        ) : null}
        <Card className="border-border bg-surface">
          <CardContent className="p-8 text-lg text-muted">
            {liveData.hasLiveData
              ? t("board.noLeaderboard")
              : t("board.waitingForLiveData")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeDivision) {
    return <LoadingBoard />;
  }

  const boardLiveData = liveData;
  const currentLeaderboard = leaderboardsByDivision.get(activeDivision);

  if (!currentLeaderboard) {
    return <LoadingBoard />;
  }

  const totalPlayers = currentLeaderboard.players.length;
  const resolvedPlayersPerPage = isAllPlayersMode(playersPerPage)
    ? Math.max(1, totalPlayers)
    : playersPerPage;
  const totalPages = Math.max(
    1,
    Math.ceil(totalPlayers / resolvedPlayersPerPage),
  );
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pagedPlayers = currentLeaderboard.players.slice(
    safePageIndex * resolvedPlayersPerPage,
    safePageIndex * resolvedPlayersPerPage + resolvedPlayersPerPage,
  );

  function syncTournamentUrl(tournamentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tournamentId", tournamentId);
    params.delete("division");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
    setPageIndex(0);
    setNextSwitchAt(Date.now() + intervalMs);
  }

  function updateBoardParams(updater: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function syncDivisionSetting(division: string) {
    updateBoardParams((params) => {
      if (!division) {
        params.delete("division");
        return;
      }

      params.set("division", division);
      params.delete("rotate");
    });
    setPageIndex(0);
    setNextSwitchAt(Date.now() + intervalMs);
  }

  function syncRotationSetting(enabled: boolean) {
    updateBoardParams((params) => {
      if (enabled) {
        params.delete("rotate");
      } else {
        params.set("rotate", "false");
      }
    });
    setRotationPaused(false);
    setNextSwitchAt(Date.now() + intervalMs);
  }

  function syncIntervalSetting(seconds: number) {
    updateBoardParams((params) => {
      params.set("interval", String(seconds));
    });
    setNextSwitchAt(Date.now() + seconds * 1000);
  }

  function syncPlayersPerPageSetting(count: number) {
    updateBoardParams((params) => {
      params.set("players", count === -1 ? "all" : String(count));
    });
    setPageIndex(0);
    setNextSwitchAt(Date.now() + intervalMs);
  }

  async function toggleFullscreen() {
    if (!fullscreenEnabled) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }

  const remainingSeconds = rotationEnabled
    ? Math.max(0, Math.ceil((nextSwitchAt - now) / 1000))
    : 0;
  const rotationProgressValue = boardRotationProgress(
    nextSwitchAt,
    intervalMs,
    now,
  );

  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-4">
      {selectedTournamentId === "lakers-open-2026" ? (
        <MockReplayPanel
          tournamentId={selectedTournamentId}
          replay={boardLiveData.mockReplay}
        />
      ) : null}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <div
          role="progressbar"
          aria-label={t("board.rotationProgress", {
            seconds: remainingSeconds,
          })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(rotationProgressValue * 100)}
          className="h-1.5 w-screen bg-border/70"
        >
          <div
            className="h-full bg-primary transition-[width] duration-1000 ease-linear"
            style={{
              width:
                rotationEnabled && !rotationPaused
                  ? `${rotationProgressValue * 100}%`
                  : "0%",
            }}
          />
        </div>
      </div>

      <BoardHeader
        locale={locale}
        searchParams={new URLSearchParams(searchParams.toString())}
        liveData={boardLiveData}
        tournaments={boardLiveData.tournaments}
        selectedTournamentId={selectedTournamentId}
        activeDivision={activeDivision}
        rotationEnabled={rotationEnabled}
        rotationPaused={rotationPaused}
        intervalSeconds={intervalSeconds}
        remainingSeconds={remainingSeconds}
        fullscreenEnabled={fullscreenEnabled}
        fullscreenActive={fullscreenActive}
        settingsOpen={settingsOpen}
        onToggleFullscreen={toggleFullscreen}
        onSelectTournament={syncTournamentUrl}
        onToggleSettings={() => setSettingsOpen((value) => !value)}
        onToggleRotation={() => {
          setRotationPaused((value) => !value);
          setNextSwitchAt(Date.now() + intervalMs);
        }}
        onPreviousDivision={() => rotateStepRef.current(-1)}
        onNextDivision={() => rotateStepRef.current(1)}
      />

      {settingsOpen ? (
        <BoardSettings
          liveData={boardLiveData}
          tournaments={boardLiveData.tournaments}
          selectedTournamentId={selectedTournamentId}
          selectedDivision={lockedDivision}
          rotationEnabled={rotationEnabled}
          intervalSeconds={intervalSeconds}
          playersPerPage={playersPerPage}
          onSelectTournament={syncTournamentUrl}
          onSelectDivision={syncDivisionSetting}
          onSetRotationEnabled={syncRotationSetting}
          onSetIntervalSeconds={syncIntervalSetting}
          onSetPlayersPerPage={syncPlayersPerPageSetting}
        />
      ) : null}

      <BoardTable
        division={activeDivision}
        players={pagedPlayers}
        pageIndex={safePageIndex}
        totalPages={totalPages}
        totalPlayers={totalPlayers}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted">
        <span>{t("board.footer")}</span>
        <div className="flex items-center gap-2">
          <MonitorPlay className="h-4 w-4" />
          <span>
            {rotationEnabled
              ? t("board.rotationEvery", { seconds: intervalSeconds })
              : t("board.rotationLocked")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LiveBoard({
  locale,
  dictionary,
}: {
  locale: AppLocale;
  dictionary: Dictionary;
}) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <LiveBoardContent locale={locale} />
    </I18nProvider>
  );
}
