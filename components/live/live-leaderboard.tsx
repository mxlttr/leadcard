"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, Info, Search, Star, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { BattleGroup } from "@/components/live/battle-group";
import { DivisionTabs } from "@/components/live/division-tabs";
import { GlobalSnapshot } from "@/components/live/global-snapshot";
import { MockReplayPanel } from "@/components/live/mock-replay-panel";
import { PlayerDetailSheet } from "@/components/live/player-detail-sheet";
import { RecentUpdatesFeed } from "@/components/live/recent-updates-feed";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFollowedPlayers } from "@/hooks/use-followed-players";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { AppLocale, Dictionary } from "@/lib/i18n";
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  LiveResponse,
  RecentUpdate,
  UpdatesResponse,
} from "@/lib/types";
import { cn, holeToLabel, isStartingListStatus } from "@/lib/utils";

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
const ALL_DIVISIONS = "__all";
const LAST_SELECTED_TOURNAMENT_KEY = "leadcard:lastSelectedTournament";

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
  showFullScoreboard: boolean,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (searchingAcrossDivisions) {
    return [
      {
        id: "search-results",
        title: t("leaderboard.searchResults"),
        players,
      },
    ];
  }

  if (filterMode === "FOLLOWING") {
    return [
      {
        id: "followed-players",
        title: t("leaderboard.followingGroup"),
        players,
      },
    ];
  }

  if (showFullScoreboard) {
    return [
      {
        id: "leaderboard-players",
        title: t("leaderboard.leaderboard"),
        players,
      },
    ];
  }

  if (players.length <= LEAD_CARD_SIZE) {
    return [
      {
        id: "leaderboard-players",
        title: t("leaderboard.leaderboard"),
        players,
      },
    ];
  }

  return [
    {
      id: "lead-battle",
      title: t("leaderboard.leadBattle"),
      players: players.slice(0, LEAD_CARD_SIZE),
    },
    {
      id: "chase-card",
      title: t("leaderboard.chaseCard"),
      players: players.slice(LEAD_CARD_SIZE),
    },
  ];
}

function tournamentStatusLabel(
  tournament: LiveResponse["tournament"],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (tournament.status === "upcoming" && tournament.daysUntilStart) {
    return t("tournaments.status.inDays", {
      count: tournament.daysUntilStart,
    });
  }

  return t(
    `tournaments.status.${tournament.status === "recent" ? "finished" : tournament.status}`,
  );
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
        {tournament.status === "recent" && tournament.daysSinceEnd ? (
          <>
            <span className="sm:hidden">
              {t("tournaments.status.finished")}
            </span>
            <span className="hidden sm:inline">
              {t("tournaments.status.finishedDaysAgo", {
                count: tournament.daysSinceEnd,
              })}
            </span>
          </>
        ) : (
          tournamentStatusLabel(tournament, t)
        )}
      </span>
    </div>
  );
}

function LiveLeaderboardContent({ locale }: { locale: AppLocale }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTournamentId = searchParams.get("tournamentId") ?? "";
  const requestedDivision = searchParams.get("division") ?? "";
  const requestedClub = searchParams.get("club") ?? "";
  const [selectedDivision, setSelectedDivision] = useState(
    requestedDivision === "all" ? ALL_DIVISIONS : requestedDivision,
  );
  const [filterMode, setFilterMode] = useState<"ALL" | "FOLLOWING">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [clubFilter, setClubFilter] = useState(
    requestedClub === "none" ? "__none" : requestedClub,
  );
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [tournamentPickerExpanded, setTournamentPickerExpanded] =
    useState(false);
  const [lastSelectedTournamentId, setLastSelectedTournamentId] = useState("");
  const [lastSelectedTournamentLoaded, setLastSelectedTournamentLoaded] =
    useState(false);
  const [tournamentTab, setTournamentTab] = useState<
    "live" | "upcoming" | "past"
  >("live");
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
  const [resolvedAllPlayersData, setResolvedAllPlayersData] =
    useState<LeaderboardResponse | null>(null);
  const [resolvedUpdatesData, setResolvedUpdatesData] =
    useState<UpdatesResponse | null>(null);
  const previousTournamentId = useRef<string | null>(null);
  const { isFollowed, togglePlayer, followedPlayers, hydrated } =
    useFollowedPlayers();

  useEffect(() => {
    setLastSelectedTournamentId(
      window.localStorage.getItem(LAST_SELECTED_TOURNAMENT_KEY) ?? "",
    );
    setLastSelectedTournamentLoaded(true);
  }, []);

  const liveQuery = useQuery({
    queryKey: ["live", locale, requestedTournamentId || "default"],
    queryFn: () =>
      fetchJson<LiveResponse>(
        requestedTournamentId
          ? `/api/live?tournamentId=${encodeURIComponent(requestedTournamentId)}`
          : "/api/live",
      ),
    refetchInterval: (query) =>
      (query.state.data as LiveResponse | undefined)?.updateIntervalMs
        ? 120_000
        : false,
    placeholderData: keepPreviousData,
  });

  const liveData = liveQuery.data ?? resolvedLiveData;
  const selectedTournamentId = requestedTournamentId;
  const resolvedTournamentId = liveData?.tournament.id || "";
  const isSelectedTournamentLiveData =
    Boolean(liveData) &&
    !liveQuery.isPlaceholderData &&
    resolvedTournamentId === selectedTournamentId;
  const selectedTournament =
    liveData?.tournaments.find(
      (tournament) => tournament.id === selectedTournamentId,
    ) ??
    (liveData?.tournament.id === selectedTournamentId
      ? liveData.tournament
      : undefined);
  const shouldRefreshSelectedTournament =
    selectedTournament?.status === "live" &&
    Boolean(liveData && liveData.updateIntervalMs > 0);
  useLiveEvents(selectedTournamentId);

  const allPlayersQuery = useQuery({
    queryKey: ["leaderboard", "all", locale, selectedTournamentId],
    queryFn: () =>
      fetchJson<LeaderboardResponse>(
        `/api/leaderboard?tournamentId=${encodeURIComponent(selectedTournamentId)}&division=${encodeURIComponent("__all")}`,
      ),
    enabled: Boolean(selectedTournamentId),
    refetchInterval: shouldRefreshSelectedTournament ? 120_000 : false,
    placeholderData: keepPreviousData,
  });

  const updatesQuery = useQuery({
    queryKey: ["updates", locale, selectedTournamentId],
    queryFn: () =>
      fetchJson<UpdatesResponse>(
        `/api/updates?tournamentId=${encodeURIComponent(selectedTournamentId)}`,
      ),
    enabled: Boolean(selectedTournamentId),
    refetchInterval: shouldRefreshSelectedTournament ? 120_000 : false,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!selectedTournamentId) {
      return;
    }

    if (
      previousTournamentId.current !== null &&
      previousTournamentId.current !== selectedTournamentId
    ) {
      setClubFilter("");
    }
    previousTournamentId.current = selectedTournamentId;
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
    if (liveQuery.data && !liveQuery.isPlaceholderData) {
      setResolvedLiveData(liveQuery.data);
    }
  }, [liveQuery.data, liveQuery.isPlaceholderData]);

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

  const allPlayersData = allPlayersQuery.data ?? resolvedAllPlayersData;
  const leaderboardData = allPlayersData
    ? {
        ...allPlayersData,
        division: selectedDivision,
        players:
          selectedDivision === ALL_DIVISIONS
            ? allPlayersData.players
            : allPlayersData.players.filter(
                (player) => player.division === selectedDivision,
              ),
      }
    : null;
  const updatesData = updatesQuery.data ?? resolvedUpdatesData;
  const isSelectedTournamentLeaderboard =
    allPlayersQuery.data?.tournamentId === selectedTournamentId &&
    !allPlayersQuery.isPlaceholderData &&
    Boolean(allPlayersQuery.data);
  const isSelectedTournamentUpdates =
    updatesQuery.data?.tournamentId === selectedTournamentId &&
    !updatesQuery.isPlaceholderData &&
    Boolean(updatesQuery.data);
  const isSelectedTournamentDataReady =
    isSelectedTournamentLiveData &&
    isSelectedTournamentLeaderboard &&
    isSelectedTournamentUpdates;
  const hasScoredPlayers = (allPlayersData?.players ?? []).some(
    (player) => player.thru !== 0,
  );

  const syncTournamentUrl = useCallback(
    (tournamentId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tournamentId", tournamentId);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!liveData || !resolvedTournamentId || liveQuery.isPlaceholderData) {
      return;
    }

    if (
      requestedTournamentId &&
      requestedTournamentId !== resolvedTournamentId
    ) {
      syncTournamentUrl(resolvedTournamentId);
    }
  }, [
    liveData,
    syncTournamentUrl,
    requestedTournamentId,
    resolvedTournamentId,
    liveQuery.isPlaceholderData,
  ]);

  useEffect(() => {
    if (
      requestedTournamentId ||
      !lastSelectedTournamentId ||
      !liveData?.tournaments.some(
        (tournament) => tournament.id === lastSelectedTournamentId,
      )
    ) {
      return;
    }

    syncTournamentUrl(lastSelectedTournamentId);
  }, [
    lastSelectedTournamentId,
    liveData,
    requestedTournamentId,
    syncTournamentUrl,
  ]);

  useEffect(() => {
    if (!requestedTournamentId) {
      return;
    }

    window.localStorage.setItem(
      LAST_SELECTED_TOURNAMENT_KEY,
      requestedTournamentId,
    );
  }, [requestedTournamentId]);

  useEffect(() => {
    if (!liveData) {
      return;
    }

    const hasDivision =
      selectedDivision === ALL_DIVISIONS ||
      liveData.divisions.includes(selectedDivision);

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
  const allTournamentPlayers =
    !hydrated || filterMode === "ALL"
      ? (allPlayersData?.players ?? currentPlayers)
      : (allPlayersData?.players ?? []).filter((player) =>
          followedPlayers.includes(player.playerId),
        );
  const tournamentPlayers =
    normalizedSearchQuery || selectedDivision === ALL_DIVISIONS
      ? allTournamentPlayers
      : players;
  const clubPlayers =
    clubFilter === "__none"
      ? tournamentPlayers.filter((player) => !player.club)
      : clubFilter
        ? tournamentPlayers.filter((player) => player.club === clubFilter)
        : tournamentPlayers;
  const searchedPlayers = normalizedSearchQuery
    ? clubPlayers.filter((player) =>
        player.name.toLocaleLowerCase().includes(normalizedSearchQuery),
      )
    : clubFilter
      ? clubPlayers
      : players;
  const orderedPlayers =
    selectedDivision === ALL_DIVISIONS
      ? [...searchedPlayers].sort((a, b) => a.scoreToPar - b.scoreToPar)
      : searchedPlayers;
  const clubs = [
    ...new Set(
      allTournamentPlayers.map((player) => player.club).filter(Boolean),
    ),
  ].sort((a, b) => (a ?? "").localeCompare(b ?? "")) as string[];

  useEffect(() => {
    if (!allPlayersData || !clubFilter || clubFilter === "__none") {
      return;
    }

    if (!allPlayersData.players.some((player) => player.club === clubFilter)) {
      setClubFilter("");
    }
  }, [allPlayersData, clubFilter]);

  useEffect(() => {
    if (!selectedTournamentId || !selectedDivision) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set(
      "division",
      selectedDivision === ALL_DIVISIONS ? "all" : selectedDivision,
    );
    if (clubFilter) {
      params.set("club", clubFilter === "__none" ? "none" : clubFilter);
    } else {
      params.delete("club");
    }
    let query = params.toString();
    if (clubFilter && clubFilter !== "__none") {
      const encodedClub = encodeURIComponent(clubFilter).replaceAll(".", "%2E");
      query = query.replace(/club=[^&]*/, `club=${encodedClub}`);
    }
    const nextUrl = query ? `${pathname}?${query}` : pathname;

    if (nextUrl !== `${pathname}?${searchParams.toString()}`) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [
    clubFilter,
    pathname,
    router,
    searchParams,
    selectedDivision,
    selectedTournamentId,
  ]);
  const visiblePlayers =
    selectedDivision === ALL_DIVISIONS || showAllPlayers
      ? orderedPlayers
      : orderedPlayers.slice(0, INITIAL_PLAYER_COUNT);
  const isCrossDivisionSearch = Boolean(normalizedSearchQuery || clubFilter);
  const groupedPlayers = groupPlayers(
    visiblePlayers,
    filterMode,
    isCrossDivisionSearch,
    selectedDivision === ALL_DIVISIONS && !isCrossDivisionSearch,
    t,
  );
  const canShowAllPlayers =
    selectedDivision !== ALL_DIVISIONS &&
    orderedPlayers.length > INITIAL_PLAYER_COUNT;
  const showTournamentList = !selectedTournamentId || tournamentPickerExpanded;
  const restoringLastTournament =
    !requestedTournamentId &&
    (!lastSelectedTournamentLoaded ||
      Boolean(
        lastSelectedTournamentId &&
          liveData?.tournaments.some(
            (tournament) => tournament.id === lastSelectedTournamentId,
          ),
      ));

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

  if (!liveData) {
    return (
      <section
        id="tournament-picker"
        className="rounded-[24px] border border-border bg-surface p-4"
      >
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-3 h-11 w-full rounded-full" />
        <Skeleton className="mt-3 h-20 rounded-[20px]" />
      </section>
    );
  }

  if (restoringLastTournament) {
    return (
      <section
        id="tournament-picker"
        className="rounded-[24px] border border-border bg-surface p-4"
        aria-label={t("tournaments.heading")}
      >
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-3 h-11 w-full rounded-full" />
        <Skeleton className="mt-3 h-20 rounded-[20px]" />
      </section>
    );
  }

  if (selectedTournamentId && (!leaderboardData || !updatesData)) {
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

  const tournamentTabs = ["live", "upcoming", "past"] as const;
  const tournamentTabHasItems = (tab: (typeof tournamentTabs)[number]) =>
    liveData.tournaments.some((tournament) => {
      if (tab === "live") {
        return tournament.status === "live" || tournament.status === "mock";
      }
      if (tab === "upcoming") {
        return ["today", "tomorrow", "upcoming"].includes(tournament.status);
      }
      return tournament.status === "finished" || tournament.status === "recent";
    });
  const availableTournamentTabs = tournamentTabs.filter(tournamentTabHasItems);
  const activeTournamentTab = availableTournamentTabs.includes(tournamentTab)
    ? tournamentTab
    : (availableTournamentTabs[0] ?? "live");

  return (
    <>
      {selectedTournamentId === "lakers-open-2026" ? (
        <MockReplayPanel
          tournamentId={selectedTournamentId}
          replay={liveData.mockReplay}
        />
      ) : null}
      <div className="space-y-5">
        {selectedTournamentId ? (
          <header className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate font-display text-3xl font-semibold tracking-tight">
                  {t("app.title")}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
          </header>
        ) : null}

        <section id="tournament-picker" className="space-y-3">
          {showTournamentList ? (
            <div className="rounded-[24px] border border-border bg-surface">
              <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                      {t("tournaments.heading")}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {t("tournaments.subheading")}
                    </p>
                  </div>
                </div>
                <Tabs
                  value={activeTournamentTab}
                  onValueChange={(value) =>
                    setTournamentTab(value as "live" | "upcoming" | "past")
                  }
                  className="mt-3"
                >
                  <TabsList>
                    {availableTournamentTabs.map((tab) => (
                      <TabsTrigger key={tab} value={tab}>
                        {t(`tournaments.tabs.${tab}`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2 p-2">
                {liveData.tournaments
                  .filter((tournament) => {
                    if (activeTournamentTab === "live") {
                      return (
                        tournament.status === "live" ||
                        tournament.status === "mock"
                      );
                    }
                    if (activeTournamentTab === "upcoming") {
                      return ["today", "tomorrow", "upcoming"].includes(
                        tournament.status,
                      );
                    }
                    return (
                      tournament.status === "finished" ||
                      tournament.status === "recent"
                    );
                  })
                  .map((tournament) => {
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
            <div className="overflow-hidden rounded-[24px] border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
                      {t("tournaments.heading")}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {t("tournaments.subheading")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-9 shrink-0 rounded-full border border-border px-3 text-xs"
                    onClick={() => setTournamentPickerExpanded(true)}
                  >
                    {t("tournaments.changeTournament")}
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                className="m-2 h-auto w-[calc(100%-1rem)] justify-between rounded-[20px] border border-primary/30 bg-background px-4 py-3 text-left text-foreground hover:bg-background"
                onClick={() => setTournamentPickerExpanded(true)}
                aria-label={t("tournaments.changeTournament")}
                title={t("tournaments.changeTournament")}
              >
                <TournamentListItem tournament={selectedTournament} selected />
              </Button>
            </div>
          ) : null}
        </section>

        {selectedTournamentId ? (
          <>
            {isSelectedTournamentLiveData ? (
              <GlobalSnapshot
                data={liveData}
                onSelectPlayer={handlePlayerSelect}
              />
            ) : (
              <Skeleton className="h-[24rem] rounded-[24px]" />
            )}

            <section id="leaderboard" className="space-y-4">
              {liveData.divisions.length > 0 ? (
                <DivisionTabs
                  divisions={[ALL_DIVISIONS, ...liveData.divisions]}
                  selectedDivision={selectedDivision}
                  onChange={setSelectedDivision}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className={cn("contents", searchFocused && "max-sm:hidden")}
                >
                  <Button
                    variant={filterMode === "ALL" ? "default" : "ghost"}
                    className={cn(
                      "h-11 shrink-0 px-4",
                      filterMode === "ALL" ? "" : "border border-border",
                    )}
                    onClick={() => {
                      setFilterMode("ALL");
                      setSearchQuery("");
                      setShowAllPlayers(false);
                    }}
                  >
                    {t("leaderboard.all")}
                  </Button>
                  <Button
                    variant={filterMode === "FOLLOWING" ? "accent" : "ghost"}
                    className={cn(
                      "h-11 shrink-0 px-4",
                      filterMode === "FOLLOWING" ? "" : "border border-border",
                    )}
                    onClick={() => {
                      setFilterMode("FOLLOWING");
                      setSearchQuery("");
                      setShowAllPlayers(false);
                    }}
                  >
                    <Star className="mr-1 h-3.5 w-3.5" />
                    {t("leaderboard.following")}
                  </Button>
                </div>

                <div
                  className={cn(
                    "relative min-w-0",
                    searchFocused
                      ? "order-first basis-full sm:order-none sm:flex-1 sm:basis-0"
                      : "min-w-0 flex-1 basis-0",
                  )}
                >
                  <label htmlFor="player-search" className="sr-only">
                    {t("leaderboard.searchLabel")}
                  </label>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input
                    id="player-search"
                    value={searchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setShowAllPlayers(false);
                    }}
                    placeholder={t("leaderboard.searchPlaceholder")}
                    className={cn(
                      "h-11 truncate pl-10 text-base",
                      searchQuery ? "pr-12" : "pr-4",
                    )}
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
                      onClick={() => {
                        setSearchQuery("");
                        setShowAllPlayers(false);
                      }}
                      aria-label={t("leaderboard.clearSearch")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <label className="sr-only" htmlFor="club-filter">
                  {t("leaderboard.clubLabel")}
                </label>
                <div className="relative min-w-0 basis-full sm:max-w-[11rem] sm:flex-1">
                  <select
                    id="club-filter"
                    value={clubFilter}
                    onChange={(event) => {
                      setClubFilter(event.target.value);
                      setShowAllPlayers(false);
                    }}
                    className="h-11 w-full min-w-0 appearance-none truncate rounded-full border border-border bg-surface px-4 pr-10 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  >
                    <option value="">{t("leaderboard.allClubs")}</option>
                    {clubs.map((club) => (
                      <option key={club} value={club}>
                        {club}
                      </option>
                    ))}
                    {tournamentPlayers.some((player) => !player.club) ? (
                      <option value="__none">{t("leaderboard.noClub")}</option>
                    ) : null}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>
              </div>

              {!isSelectedTournamentDataReady ? (
                <div
                  className="space-y-3"
                  role="status"
                  aria-label={t("leaderboard.loadingTournament")}
                >
                  <p className="rounded-[18px] border border-border bg-surface px-4 py-3 text-sm text-muted">
                    {t("leaderboard.loadingTournament")}
                  </p>
                  <Skeleton className="h-48 rounded-[24px]" />
                  <Skeleton className="h-48 rounded-[24px]" />
                </div>
              ) : !liveData.hasLiveData && currentPlayers.length === 0 ? (
                <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
                  {liveData.tournament.status === "upcoming" ||
                  liveData.tournament.status === "tomorrow"
                    ? t("leaderboard.noLiveData")
                    : t("leaderboard.noLiveScoring")}
                </div>
              ) : searchedPlayers.length === 0 ? (
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
                      id={group.id}
                      title={group.title}
                      players={group.players}
                      divisionPlayers={currentPlayers}
                      showDivision={
                        isCrossDivisionSearch ||
                        selectedDivision === ALL_DIVISIONS
                      }
                      overallRank={selectedDivision === ALL_DIVISIONS}
                      upcoming={
                        isStartingListStatus(liveData.tournament.status) &&
                        !hasScoredPlayers
                      }
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

            {isSelectedTournamentDataReady ? (
              <RecentUpdatesFeed
                updates={updatesData?.updates ?? []}
                onSelectUpdate={handleUpdateSelect}
              />
            ) : (
              <Skeleton className="h-64 rounded-[24px]" />
            )}

            <footer className="rounded-[20px] border border-border bg-surface px-4 py-4 text-sm text-muted">
              {t("leaderboard.footer")}
              {selectedPlayer
                ? ` ${t("leaderboard.selectedPlayerFooter", {
                    name: selectedPlayer.name,
                    status: holeToLabel(selectedPlayer.thru, t).toLowerCase(),
                  })}`
                : ""}
            </footer>
          </>
        ) : null}
      </div>

      {selectedTournamentId ? (
        <PlayerDetailSheet
          player={selectedPlayer}
          divisionPlayers={currentPlayers}
          updates={updatesData?.updates ?? []}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      ) : null}
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
