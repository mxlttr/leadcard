"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useFollowedPlayers } from "@/hooks/use-followed-players";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { BattleGroup } from "@/components/live/battle-group";
import { DivisionTabs } from "@/components/live/division-tabs";
import { GlobalSnapshot } from "@/components/live/global-snapshot";
import { PlayerDetailSheet } from "@/components/live/player-detail-sheet";
import { RecentUpdatesList } from "@/components/live/recent-updates-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createTranslator,
  locales,
  type AppLocale,
  type Dictionary,
} from "@/lib/i18n";
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  LiveResponse,
  UpdatesResponse,
} from "@/lib/types";
import { cn, holeToLabel, timestampLabel } from "@/lib/utils";

async function fetchJson<T>(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return (await response.json()) as T;
}

function LoadingShell() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-56 rounded-[24px]" />
      <Skeleton className="h-12 rounded-full" />
      <Skeleton className="h-40 rounded-[24px]" />
      <Skeleton className="h-40 rounded-[24px]" />
      <Skeleton className="h-64 rounded-[24px]" />
    </div>
  );
}

function groupPlayers(
  players: LeaderboardPlayer[],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (players.length <= 3) {
    return [{ title: t("leaderboard.leaderboard"), players }];
  }

  return [
    { title: t("leaderboard.leadBattle"), players: players.slice(0, 3) },
    { title: t("leaderboard.chaseCard"), players: players.slice(3) },
  ];
}

function tournamentStatusLabel(
  status: LiveResponse["tournament"]["status"],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return t(`tournaments.status.${status}`);
}

function LanguageSwitcher({ locale }: { locale: AppLocale }) {
  const { t } = useI18n();

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border bg-surface p-1"
      aria-label={t("language.switcherLabel")}
    >
      {locales.map((item) => {
        const active = item === locale;

        return (
          <Link
            key={item}
            href={`/${item}`}
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
    </div>
  );
}

function LiveLeaderboardContent({ locale }: { locale: AppLocale }) {
  const { t } = useI18n();
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [filterMode, setFilterMode] = useState<"ALL" | "FOLLOWING">("ALL");
  const [selectedPlayer, setSelectedPlayer] =
    useState<LeaderboardPlayer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resolvedLiveData, setResolvedLiveData] = useState<LiveResponse | null>(
    null,
  );
  const [resolvedLeaderboardData, setResolvedLeaderboardData] =
    useState<LeaderboardResponse | null>(null);
  const [resolvedUpdatesData, setResolvedUpdatesData] =
    useState<UpdatesResponse | null>(null);
  const { isFollowed, togglePlayer, followedPlayers, hydrated } =
    useFollowedPlayers();

  const liveQuery = useQuery({
    queryKey: ["live", locale, selectedTournamentId || "default"],
    queryFn: () =>
      fetchJson<LiveResponse>(
        selectedTournamentId
          ? `/api/live?tournamentId=${encodeURIComponent(selectedTournamentId)}`
          : "/api/live",
      ),
    placeholderData: keepPreviousData,
  });

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", locale, selectedTournamentId, selectedDivision],
    queryFn: () =>
      fetchJson<LeaderboardResponse>(
        `/api/leaderboard?tournamentId=${encodeURIComponent(selectedTournamentId)}&division=${encodeURIComponent(selectedDivision)}`,
      ),
    enabled: Boolean(selectedTournamentId),
    placeholderData: keepPreviousData,
  });

  const updatesQuery = useQuery({
    queryKey: ["updates", locale, selectedTournamentId],
    queryFn: () =>
      fetchJson<UpdatesResponse>(
        `/api/updates?tournamentId=${encodeURIComponent(selectedTournamentId)}`,
      ),
    enabled: Boolean(selectedTournamentId),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    setSelectedPlayer(null);
    setSheetOpen(false);
  }, [selectedTournamentId, selectedDivision]);

  useEffect(() => {
    if (liveQuery.data) {
      setResolvedLiveData(liveQuery.data);
    }
  }, [liveQuery.data]);

  useEffect(() => {
    if (leaderboardQuery.data) {
      setResolvedLeaderboardData(leaderboardQuery.data);
    }
  }, [leaderboardQuery.data]);

  useEffect(() => {
    if (updatesQuery.data) {
      setResolvedUpdatesData(updatesQuery.data);
    }
  }, [updatesQuery.data]);

  const liveData = liveQuery.data ?? resolvedLiveData;
  const leaderboardData = leaderboardQuery.data ?? resolvedLeaderboardData;
  const updatesData = updatesQuery.data ?? resolvedUpdatesData;

  useEffect(() => {
    if (!liveData) {
      return;
    }

    const hasSelection = liveData.tournaments.some(
      (tournament) => tournament.id === selectedTournamentId,
    );

    if (!selectedTournamentId || !hasSelection) {
      setSelectedTournamentId(liveData.tournament.id);
    }
  }, [liveData, selectedTournamentId]);

  useEffect(() => {
    if (!liveData) {
      return;
    }

    const hasDivision = liveData.divisions.includes(selectedDivision);

    if (!selectedDivision || !hasDivision) {
      setSelectedDivision(liveData.divisions[0] ?? "");
    }
  }, [liveData, selectedDivision]);

  const currentPlayers = leaderboardData?.players ?? [];
  const players =
    !hydrated || filterMode === "ALL"
      ? currentPlayers
      : currentPlayers.filter((player) =>
          followedPlayers.includes(player.playerId),
        );
  const groupedPlayers = groupPlayers(players, t);

  if (!liveData || !leaderboardData || !updatesData) {
    return <LoadingShell />;
  }

  return (
    <>
      <div className="space-y-5">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
                {t("app.name")}
              </p>
              <h1 className="mt-2 truncate font-display text-3xl font-semibold tracking-tight">
                {t("app.title")}
              </h1>
              <p className="mt-2 max-w-[34rem] text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {t("app.tagline")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LanguageSwitcher locale={locale} />
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full border border-border p-0"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("app.nearLiveTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("app.nearLiveDescription")}
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm text-muted">
            <span className="truncate">
              {liveData.hasLiveData
                ? t("app.latestUpdate", {
                    time: timestampLabel(liveData.generatedAt, locale),
                  })
                : liveData.tournament.status === "upcoming"
                  ? t("app.upcomingTournament")
                  : t("app.liveScoringUnavailable")}
            </span>
            <span className="truncate text-right">
              {liveData.tournament.roundLabel}
            </span>
          </div>
        </header>

        <section className="space-y-3">
          <div className="px-1">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
              {t("tournaments.heading")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("tournaments.subheading")}
            </p>
          </div>
          <div className="max-h-[230px] overflow-y-auto rounded-[24px] border border-border bg-surface px-2 py-2">
            <div className="space-y-2 pr-1">
              {liveData.tournaments.map((tournament) => {
                const selected = selectedTournamentId === tournament.id;

                return (
                  <Button
                    key={tournament.id}
                    variant="ghost"
                    className={cn(
                      "h-auto w-full justify-between rounded-[20px] border px-4 py-3 text-left",
                      selected
                        ? "border-primary/30 bg-background text-foreground"
                        : "border-border bg-transparent text-muted hover:bg-background hover:text-foreground",
                    )}
                    onClick={() => setSelectedTournamentId(tournament.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {tournament.name}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block truncate text-xs",
                          selected ? "text-foreground/70" : "text-muted",
                        )}
                      >
                        {tournament.course} · {tournament.roundLabel}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "ml-3 shrink-0 text-xs uppercase tracking-[0.2em]",
                        selected && tournament.status === "live"
                          ? "text-primary"
                          : "text-muted",
                      )}
                    >
                      {tournamentStatusLabel(tournament.status, t)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </section>

        <GlobalSnapshot data={liveData} />

        <section className="space-y-4">
          {liveData.divisions.length > 0 ? (
            <DivisionTabs
              divisions={liveData.divisions}
              selectedDivision={selectedDivision}
              onChange={setSelectedDivision}
            />
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              variant={filterMode === "ALL" ? "default" : "ghost"}
              size="sm"
              className={filterMode === "ALL" ? "" : "border border-border"}
              onClick={() => setFilterMode("ALL")}
            >
              {t("leaderboard.all")}
            </Button>
            <Button
              variant={filterMode === "FOLLOWING" ? "accent" : "ghost"}
              size="sm"
              className={
                filterMode === "FOLLOWING" ? "" : "border border-border"
              }
              onClick={() => setFilterMode("FOLLOWING")}
            >
              <Star className="mr-1 h-3.5 w-3.5" />
              {t("leaderboard.following")}
            </Button>
          </div>

          {!liveData.hasLiveData ? (
            <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
              {liveData.tournament.status === "upcoming"
                ? t("leaderboard.noLiveData")
                : t("leaderboard.noLiveScoring")}
            </div>
          ) : null}

          {players.length === 0 ? (
            <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
              {!liveData.hasLiveData
                ? t("leaderboard.noLeaderboard")
                : filterMode === "FOLLOWING"
                  ? t("leaderboard.noFollowedPlayers")
                  : t("leaderboard.noPlayers")}
            </div>
          ) : (
            groupedPlayers.map((group) => (
              <BattleGroup
                key={group.title}
                title={group.title}
                players={group.players}
                isFollowed={isFollowed}
                onFollowToggle={togglePlayer}
                onPlayerSelect={(player) => {
                  setSelectedPlayer(player);
                  setSheetOpen(true);
                }}
              />
            ))
          )}
        </section>

        <RecentUpdatesList updates={updatesData.updates} />

        <footer className="rounded-[20px] border border-border bg-surface px-4 py-4 text-sm text-muted">
          {t("leaderboard.footer")}
          {selectedPlayer
            ? ` ${t("leaderboard.selectedPlayerFooter", {
                name: selectedPlayer.name,
                status: holeToLabel(selectedPlayer.thru, t).toLowerCase(),
              })}`
            : ""}
        </footer>
      </div>

      <PlayerDetailSheet
        player={selectedPlayer}
        updates={updatesData.updates}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}

export function LiveLeaderboard({
  locale,
  dictionary,
}: {
  locale: AppLocale;
  dictionary: Dictionary;
}) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <LiveLeaderboardContent locale={locale} />
    </I18nProvider>
  );
}
