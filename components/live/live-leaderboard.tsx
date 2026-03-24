"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info, Star } from "lucide-react";
import { useEffect, useState } from "react";

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
import type { LeaderboardPlayer, LeaderboardResponse, LiveResponse, UpdatesResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { holeToLabel, timestampLabel } from "@/lib/utils";
import { useFollowedPlayers } from "@/hooks/use-followed-players";

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

function groupPlayers(players: LeaderboardPlayer[]) {
  if (players.length <= 3) {
    return [{ title: "Leaderboard", players }];
  }

  return [
    { title: "Lead battle", players: players.slice(0, 3) },
    { title: "Chase card", players: players.slice(3) },
  ];
}

function tournamentStatusLabel(status: LiveResponse["tournament"]["status"]) {
  if (status === "upcoming") {
    return "Upcoming";
  }

  if (status === "recent") {
    return "Recent";
  }

  if (status === "mock") {
    return "Mock";
  }

  return "Live";
}

export function LiveLeaderboard() {
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [filterMode, setFilterMode] = useState<"ALL" | "FOLLOWING">("ALL");
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardPlayer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isFollowed, togglePlayer, followedPlayers, hydrated } = useFollowedPlayers();

  const liveQuery = useQuery({
    queryKey: ["live", selectedTournamentId || "default"],
    queryFn: () =>
      fetchJson<LiveResponse>(
        selectedTournamentId
          ? `/api/live?tournamentId=${encodeURIComponent(selectedTournamentId)}`
          : "/api/live",
      ),
    placeholderData: keepPreviousData,
  });

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", selectedTournamentId, selectedDivision],
    queryFn: () =>
      fetchJson<LeaderboardResponse>(
        `/api/leaderboard?tournamentId=${encodeURIComponent(selectedTournamentId)}&division=${encodeURIComponent(selectedDivision)}`,
      ),
    enabled: Boolean(selectedTournamentId),
    placeholderData: keepPreviousData,
  });

  const updatesQuery = useQuery({
    queryKey: ["updates", selectedTournamentId],
    queryFn: () =>
      fetchJson<UpdatesResponse>(`/api/updates?tournamentId=${encodeURIComponent(selectedTournamentId)}`),
    enabled: Boolean(selectedTournamentId),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    setSelectedPlayer(null);
    setSheetOpen(false);
  }, [selectedTournamentId, selectedDivision]);

  useEffect(() => {
    if (!liveQuery.data) {
      return;
    }

    const hasSelection = liveQuery.data.tournaments.some(
      (tournament) => tournament.id === selectedTournamentId,
    );

    if (!selectedTournamentId || !hasSelection) {
      setSelectedTournamentId(liveQuery.data.tournament.id);
    }
  }, [liveQuery.data, selectedTournamentId]);

  useEffect(() => {
    if (!liveQuery.data) {
      return;
    }

    const hasDivision = liveQuery.data.divisions.includes(selectedDivision);

    if (!selectedDivision || !hasDivision) {
      setSelectedDivision(liveQuery.data.divisions[0] ?? "");
    }
  }, [liveQuery.data, selectedDivision]);

  const currentPlayers = leaderboardQuery.data?.players ?? [];
  const players =
    !hydrated || filterMode === "ALL"
      ? currentPlayers
      : currentPlayers.filter((player) => followedPlayers.includes(player.playerId));
  const groupedPlayers = groupPlayers(players);

  if (!liveQuery.data || !leaderboardQuery.data || !updatesQuery.data) {
    return <LoadingShell />;
  }

  return (
    <>
      <div className="space-y-5">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">Leadcard</p>
              <h1 className="mt-2 truncate font-display text-3xl font-semibold tracking-tight">
                Live standings
              </h1>
              <p className="mt-2 max-w-[34rem] text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                Spectator-first leaderboard focused on movement, leaders, and the latest meaningful update.
              </p>
            </div>
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
                  <DialogTitle>Near-live, not real-time</DialogTitle>
                  <DialogDescription>
                    Scores are scraped and diffed on an interval, so updates reflect the latest visible scoring state rather than shot-by-shot tracking.
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm text-muted">
            <span className="truncate">
              {liveQuery.data.hasLiveData
                ? `Latest update ${timestampLabel(liveQuery.data.generatedAt)}`
                : liveQuery.data.tournament.status === "upcoming"
                  ? "Upcoming tournament"
                  : "Live scoring unavailable"}
            </span>
            <span className="truncate text-right">{liveQuery.data.tournament.roundLabel}</span>
          </div>
        </header>

        <section className="space-y-3">
          <div className="px-1">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
              Tournaments
            </h2>
            <p className="mt-1 text-sm text-muted">
              Active events from one week back to one week ahead.
            </p>
          </div>
          <div className="max-h-[230px] overflow-y-auto rounded-[24px] border border-border bg-surface px-2 py-2">
            <div className="space-y-2 pr-1">
              {liveQuery.data.tournaments.map((tournament) => {
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
                      <span
                        className={cn(
                          "block truncate font-medium",
                          selected ? "text-foreground" : "text-foreground",
                        )}
                      >
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
                        selected && tournament.status === "live" ? "text-primary" : "text-muted",
                      )}
                    >
                      {tournamentStatusLabel(tournament.status)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </section>

        <GlobalSnapshot data={liveQuery.data} />

        <section className="space-y-4">
          {liveQuery.data.divisions.length > 0 ? (
            <DivisionTabs
              divisions={liveQuery.data.divisions}
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
              All
            </Button>
            <Button
              variant={filterMode === "FOLLOWING" ? "accent" : "ghost"}
              size="sm"
              className={filterMode === "FOLLOWING" ? "" : "border border-border"}
              onClick={() => setFilterMode("FOLLOWING")}
            >
              <Star className="mr-1 h-3.5 w-3.5" />
              Following
            </Button>
          </div>

          {!liveQuery.data.hasLiveData ? (
            <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
              {liveQuery.data.tournament.status === "upcoming"
                ? "This tournament has not started live scoring yet. Check back closer to tee time."
                : "Live scoring is not available for this tournament right now."}
            </div>
          ) : null}

          {players.length === 0 ? (
            <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
              {!liveQuery.data.hasLiveData
                ? "No leaderboard is available yet."
                : filterMode === "FOLLOWING"
                ? "No followed players in this division yet."
                : "No players available for this division."}
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

        <RecentUpdatesList updates={updatesQuery.data.updates} />

        <footer className="rounded-[20px] border border-border bg-surface px-4 py-4 text-sm text-muted">
          Latest visible scoring state. Through values reflect the most recently published hole, not live shot tracking.
          {selectedPlayer ? ` ${selectedPlayer.name} is ${holeToLabel(selectedPlayer.thru).toLowerCase()}.` : ""}
        </footer>
      </div>

      <PlayerDetailSheet
        player={selectedPlayer}
        updates={updatesQuery.data.updates}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
