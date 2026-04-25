"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info, Moon, Search, Star, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { BattleGroup } from "@/components/live/battle-group";
import { DivisionTabs } from "@/components/live/division-tabs";
import { GlobalSnapshot } from "@/components/live/global-snapshot";
import { PlayerDetailSheet } from "@/components/live/player-detail-sheet";
import { RecentUpdatesFeed } from "@/components/live/recent-updates-feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useFollowedPlayers } from "@/hooks/use-followed-players";
import { type AppLocale, type Dictionary, locales } from "@/lib/i18n";
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  LiveResponse,
  RecentUpdate,
  UpdatesResponse,
} from "@/lib/types";
import { cn, holeToLabel, timestampLabel } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return (await response.json()) as T;
}

const LEAD_CARD_SIZE = 4;
const INITIAL_PLAYER_COUNT = 8;

function formatRefreshCountdown(nextUpdateAt: string, now: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(nextUpdateAt).getTime() - now) / 1000),
  );

  return remainingSeconds;
}

function refreshProgress(
  nextUpdateAt: string,
  updateIntervalMs: number,
  now: number,
) {
  const nextUpdateAtMs = new Date(nextUpdateAt).getTime();

  if (Number.isNaN(nextUpdateAtMs) || updateIntervalMs <= 0) {
    return 0;
  }

  const remainingMs = Math.max(0, nextUpdateAtMs - now);
  return Math.max(0, Math.min(1, remainingMs / updateIntervalMs));
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
  filterMode: "ALL" | "FOLLOWING",
  searchingAcrossDivisions: boolean,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (searchingAcrossDivisions) {
    return [
      {
        title: t("leaderboard.searchResults"),
        players,
      },
    ];
  }

  if (filterMode === "FOLLOWING") {
    return [
      {
        title: t("leaderboard.followingGroup"),
        players,
      },
    ];
  }

  if (players.length <= LEAD_CARD_SIZE) {
    return [
      {
        title: t("leaderboard.leaderboard"),
        players,
      },
    ];
  }

  return [
    {
      title: t("leaderboard.leadBattle"),
      players: players.slice(0, LEAD_CARD_SIZE),
    },
    { title: t("leaderboard.chaseCard"), players: players.slice(LEAD_CARD_SIZE) },
  ];
}

function tournamentStatusLabel(
  status: LiveResponse["tournament"]["status"],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return t(`tournaments.status.${status}`);
}

function tournamentStatusClass(
  status: LiveResponse["tournament"]["status"],
  selected: boolean,
) {
  if (status === "live") {
    return selected
      ? "bg-transparent text-negative"
      : "bg-transparent text-negative";
  }

  return selected
    ? "bg-transparent text-foreground/70"
    : "bg-transparent text-muted";
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

function TournamentListItem({
  tournament,
  selected,
}: {
  tournament: LiveResponse["tournament"];
  selected: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="flex w-full items-center justify-between gap-3">
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
          {tournament.course} · {tournamentRoundSummary(tournament, t)}
        </span>
      </span>
      <span
        className={cn(
          "ml-3 inline-flex shrink-0 items-center gap-2 px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.16em]",
          tournamentStatusClass(tournament.status, selected),
        )}
      >
        {tournament.status === "live" ? (
          <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-negative/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-negative" />
          </span>
        ) : null}
        {tournamentStatusLabel(tournament.status, t)}
      </span>
    </div>
  );
}

function LanguageSwitcher({ locale }: { locale: AppLocale }) {
  const { t } = useI18n();

  return (
    <nav
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
    </nav>
  );
}

function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-10 w-10 shrink-0 rounded-full border border-border p-0"
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
  );
}

function LiveLeaderboardContent({ locale }: { locale: AppLocale }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTournamentId = searchParams.get("tournamentId") ?? "";
  const hasTournamentIdInUrl = searchParams.has("tournamentId");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [filterMode, setFilterMode] = useState<"ALL" | "FOLLOWING">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [tournamentPickerExpanded, setTournamentPickerExpanded] =
    useState(() => !hasTournamentIdInUrl);
  const [selectedPlayer, setSelectedPlayer] =
    useState<LeaderboardPlayer | null>(null);
  const [pendingUpdateTarget, setPendingUpdateTarget] = useState<{
    playerId: string;
    division: string;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resolvedLiveData, setResolvedLiveData] = useState<LiveResponse | null>(
    null,
  );
  const [resolvedLeaderboardData, setResolvedLeaderboardData] =
    useState<LeaderboardResponse | null>(null);
  const [resolvedAllPlayersData, setResolvedAllPlayersData] =
    useState<LeaderboardResponse | null>(null);
  const [resolvedUpdatesData, setResolvedUpdatesData] =
    useState<UpdatesResponse | null>(null);
  const [refreshNow, setRefreshNow] = useState(() => Date.now());
  const { isFollowed, togglePlayer, followedPlayers, hydrated } =
    useFollowedPlayers();

  const liveQuery = useQuery({
    queryKey: ["live", locale, requestedTournamentId || "default"],
    queryFn: () =>
      fetchJson<LiveResponse>(
        requestedTournamentId
          ? `/api/live?tournamentId=${encodeURIComponent(requestedTournamentId)}`
          : "/api/live",
      ),
    refetchInterval: (query) => {
      const interval = (query.state.data as LiveResponse | undefined)?.updateIntervalMs;
      return interval && interval > 0 ? interval : false;
    },
    placeholderData: keepPreviousData,
  });

  const liveData = liveQuery.data ?? resolvedLiveData;
  const selectedTournamentId =
    requestedTournamentId || liveData?.tournament.id || "";
  const resolvedTournamentId = liveData?.tournament.id || "";
  const selectedTournament =
    liveData?.tournaments.find(
      (tournament) => tournament.id === selectedTournamentId,
    ) ?? liveData?.tournament;

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", locale, selectedTournamentId, selectedDivision],
    queryFn: () =>
      fetchJson<LeaderboardResponse>(
        `/api/leaderboard?tournamentId=${encodeURIComponent(selectedTournamentId)}&division=${encodeURIComponent(selectedDivision)}`,
      ),
    enabled: Boolean(selectedTournamentId),
    refetchInterval:
      liveData && liveData.updateIntervalMs > 0 ? liveData.updateIntervalMs : false,
    placeholderData: keepPreviousData,
  });

  const allPlayersQuery = useQuery({
    queryKey: ["leaderboard", "all", locale, selectedTournamentId],
    queryFn: () =>
      fetchJson<LeaderboardResponse>(
        `/api/leaderboard?tournamentId=${encodeURIComponent(selectedTournamentId)}&division=${encodeURIComponent("__all")}`,
      ),
    enabled: Boolean(selectedTournamentId && searchQuery.trim()),
    refetchInterval:
      liveData && liveData.updateIntervalMs > 0 ? liveData.updateIntervalMs : false,
    placeholderData: keepPreviousData,
  });

  const updatesQuery = useQuery({
    queryKey: ["updates", locale, selectedTournamentId],
    queryFn: () =>
      fetchJson<UpdatesResponse>(
        `/api/updates?tournamentId=${encodeURIComponent(selectedTournamentId)}`,
      ),
    enabled: Boolean(selectedTournamentId),
    refetchInterval:
      liveData && liveData.updateIntervalMs > 0 ? liveData.updateIntervalMs : false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!selectedTournamentId) {
      return;
    }

    setSearchQuery("");
    setShowAllPlayers(false);
    setSelectedPlayer(null);
    setSheetOpen(false);
    setPendingUpdateTarget(null);
  }, [selectedTournamentId]);

  useEffect(() => {
    if (!selectedDivision) {
      return;
    }

    setSearchQuery("");
    setShowAllPlayers(false);
    setSelectedPlayer(null);
    setSheetOpen(false);
  }, [selectedDivision]);

  useEffect(() => {
    setSearchQuery("");
    setShowAllPlayers(false);
  }, [filterMode]);

  useEffect(() => {
    setShowAllPlayers(false);
  }, [searchQuery]);

  useEffect(() => {
    if (liveQuery.data && !liveQuery.isPlaceholderData) {
      setResolvedLiveData(liveQuery.data);
    }
  }, [liveQuery.data, liveQuery.isPlaceholderData]);

  useEffect(() => {
    if (leaderboardQuery.data && !leaderboardQuery.isPlaceholderData) {
      setResolvedLeaderboardData(leaderboardQuery.data);
    }
  }, [leaderboardQuery.data, leaderboardQuery.isPlaceholderData]);

  useEffect(() => {
    if (allPlayersQuery.data && !allPlayersQuery.isPlaceholderData) {
      setResolvedAllPlayersData(allPlayersQuery.data);
    }
  }, [allPlayersQuery.data, allPlayersQuery.isPlaceholderData]);

  useEffect(() => {
    if (updatesQuery.data && !updatesQuery.isPlaceholderData) {
      setResolvedUpdatesData(updatesQuery.data);
    }
  }, [updatesQuery.data, updatesQuery.isPlaceholderData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const leaderboardData = leaderboardQuery.data ?? resolvedLeaderboardData;
  const allPlayersData = allPlayersQuery.data ?? resolvedAllPlayersData;
  const updatesData = updatesQuery.data ?? resolvedUpdatesData;

  function syncTournamentUrl(tournamentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tournamentId", tournamentId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  useEffect(() => {
    if (!liveData || !resolvedTournamentId || liveQuery.isPlaceholderData) {
      return;
    }

    if (requestedTournamentId && requestedTournamentId !== resolvedTournamentId) {
      syncTournamentUrl(resolvedTournamentId);
    }
  }, [
    liveData,
    pathname,
    requestedTournamentId,
    resolvedTournamentId,
    router,
    searchParams,
    liveQuery.isPlaceholderData,
  ]);

  useEffect(() => {
    if (!hasTournamentIdInUrl) {
      setTournamentPickerExpanded(true);
    }
  }, [hasTournamentIdInUrl]);

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
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const tournamentPlayers =
    !hydrated || filterMode === "ALL"
      ? (allPlayersData?.players ?? currentPlayers)
      : (allPlayersData?.players ?? []).filter((player) =>
          followedPlayers.includes(player.playerId),
        );
  const searchedPlayers = normalizedSearchQuery
    ? tournamentPlayers.filter((player) =>
        player.name.toLocaleLowerCase().includes(normalizedSearchQuery),
      )
    : players;
  const visiblePlayers = showAllPlayers
    ? searchedPlayers
    : searchedPlayers.slice(0, INITIAL_PLAYER_COUNT);
  const isCrossDivisionSearch = Boolean(normalizedSearchQuery);
  const groupedPlayers = groupPlayers(
    visiblePlayers,
    filterMode,
    isCrossDivisionSearch,
    t,
  );
  const canShowAllPlayers = searchedPlayers.length > INITIAL_PLAYER_COUNT;
  const refreshCountdown = liveData
    ? formatRefreshCountdown(liveData.nextUpdateAt, refreshNow)
    : 0;
  const refreshProgressValue = liveData
    ? refreshProgress(liveData.nextUpdateAt, liveData.updateIntervalMs, refreshNow)
    : 0;
  const showTournamentList = !hasTournamentIdInUrl || tournamentPickerExpanded;

  useEffect(() => {
    if (!pendingUpdateTarget) {
      return;
    }

    const matchedPlayer = currentPlayers.find(
      (player) => player.playerId === pendingUpdateTarget.playerId,
    );

    if (!matchedPlayer) {
      return;
    }

    setSelectedPlayer(matchedPlayer);
    setSheetOpen(true);
    setPendingUpdateTarget(null);
  }, [currentPlayers, pendingUpdateTarget]);

  if (!liveData || !leaderboardData || !updatesData) {
    return <LoadingShell />;
  }

  function openPlayerDetails(player: LeaderboardPlayer) {
    setSelectedPlayer(player);
    setSheetOpen(true);
  }

  function handlePlayerSelect(player: LeaderboardPlayer) {
    if (player.division === selectedDivision) {
      const matchedPlayer = currentPlayers.find(
        (entry) => entry.playerId === player.playerId,
      );

      openPlayerDetails(matchedPlayer ?? player);
      return;
    }

    if (!liveData?.divisions.includes(player.division)) {
      return;
    }

    setPendingUpdateTarget({
      playerId: player.playerId,
      division: player.division,
    });
    setSelectedDivision(player.division);
  }

  function handleUpdateSelect(update: RecentUpdate) {
    setFilterMode("ALL");

    const matchedPlayer = currentPlayers.find(
      (player) => player.playerId === update.playerId,
    );

    if (matchedPlayer && update.division === selectedDivision) {
      openPlayerDetails(matchedPlayer);
      return;
    }

    if (!liveData?.divisions.includes(update.division)) {
      return;
    }

    setPendingUpdateTarget({
      playerId: update.playerId,
      division: update.division,
    });
    setSelectedDivision(update.division);
  }

  return (
    <>
      {liveData.hasLiveData ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
          <div
            role="progressbar"
            aria-label={
              refreshCountdown > 0
                ? t("app.nextRefresh", { seconds: refreshCountdown })
                : t("app.refreshingNow")
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(refreshProgressValue * 100)}
            className="h-1.5 w-screen bg-border/70"
          >
            <div
              className="h-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${refreshProgressValue * 100}%` }}
            />
          </div>
        </div>
      ) : null}
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
              <ThemeToggle />
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
            <div className="min-w-0">
              <span className="block truncate">
                {liveData.hasLiveData
                  ? t("app.latestUpdate", {
                      time: timestampLabel(liveData.generatedAt, locale),
                    })
                  : liveData.tournament.status === "upcoming"
                    ? t("app.upcomingTournament")
                    : t("app.liveScoringUnavailable")}
              </span>
            </div>
            <span className="truncate text-right">
              {tournamentRoundSummary(liveData.tournament, t)}
            </span>
          </div>
        </header>

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                {t("tournaments.heading")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t("tournaments.subheading")}
              </p>
            </div>
            {hasTournamentIdInUrl && !showTournamentList ? (
              <Button
                variant="ghost"
                className="h-11 shrink-0 rounded-full border border-border px-4"
                onClick={() => setTournamentPickerExpanded(true)}
              >
                {t("tournaments.changeTournament")}
              </Button>
            ) : null}
          </div>
          {showTournamentList ? (
            <div className="max-h-[230px] overflow-y-auto rounded-[24px] border border-border bg-surface p-2">
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
                      onClick={() => {
                        setTournamentPickerExpanded(false);
                        syncTournamentUrl(tournament.id);
                      }}
                    >
                      <TournamentListItem
                        tournament={tournament}
                        selected={selected}
                      />
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : selectedTournament ? (
            <div className="rounded-[24px] border border-border bg-surface p-2">
              <Button
                variant="ghost"
                className="h-auto w-full justify-between rounded-[20px] border border-primary/30 bg-background px-4 py-3 text-left text-foreground hover:bg-background"
                onClick={() => setTournamentPickerExpanded(true)}
                aria-label={t("tournaments.changeTournament")}
                title={t("tournaments.changeTournament")}
              >
                <TournamentListItem tournament={selectedTournament} selected />
              </Button>
            </div>
          ) : null}
        </section>

        <GlobalSnapshot data={liveData} onSelectPlayer={handlePlayerSelect} />

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
              className={cn(
                "h-11 px-4",
                filterMode === "ALL" ? "" : "border border-border",
              )}
              onClick={() => setFilterMode("ALL")}
            >
              {t("leaderboard.all")}
            </Button>
            <Button
              variant={filterMode === "FOLLOWING" ? "accent" : "ghost"}
              className={cn(
                "h-11 px-4",
                filterMode === "FOLLOWING" ? "" : "border border-border",
              )}
              onClick={() => setFilterMode("FOLLOWING")}
            >
              <Star className="mr-1 h-3.5 w-3.5" />
              {t("leaderboard.following")}
            </Button>

            <div className="relative min-w-0 flex-1">
              <label htmlFor="player-search" className="sr-only">
                {t("leaderboard.searchLabel")}
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="player-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("leaderboard.searchPlaceholder")}
                className="h-11 pl-10 pr-12"
                aria-describedby="player-search-hint"
              />
              <span id="player-search-hint" className="sr-only">
                {t("leaderboard.searchHint")}
              </span>
              {searchQuery ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full"
                  onClick={() => setSearchQuery("")}
                  aria-label={t("leaderboard.clearSearch")}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {!liveData.hasLiveData ? (
            <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
              {liveData.tournament.status === "upcoming"
                ? t("leaderboard.noLiveData")
                : t("leaderboard.noLiveScoring")}
            </div>
          ) : null}

          {searchedPlayers.length === 0 ? (
            <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
              {!liveData.hasLiveData
                ? t("leaderboard.noLeaderboard")
                : normalizedSearchQuery
                  ? t("leaderboard.noSearchResults")
                : filterMode === "FOLLOWING"
                  ? t("leaderboard.noFollowedPlayers")
                  : t("leaderboard.noPlayers")}
            </div>
          ) : (
            <>
              {groupedPlayers.map((group) => (
                <BattleGroup
                  key={group.title}
                  title={group.title}
                  players={group.players}
                  divisionPlayers={currentPlayers}
                  showDivision={isCrossDivisionSearch}
                  isFollowed={isFollowed}
                  onFollowToggle={togglePlayer}
                  onPlayerSelect={handlePlayerSelect}
                />
              ))}
              {canShowAllPlayers ? (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="ghost"
                    className="rounded-full border border-border"
                    onClick={() => setShowAllPlayers((current) => !current)}
                  >
                    {showAllPlayers
                      ? t("leaderboard.showLessPlayers")
                      : t("leaderboard.showAllPlayers", {
                          count: searchedPlayers.length,
                        })}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <RecentUpdatesFeed
          updates={updatesData.updates}
          onSelectUpdate={handleUpdateSelect}
        />

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
        divisionPlayers={currentPlayers}
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
