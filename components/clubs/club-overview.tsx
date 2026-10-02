"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { PlayerDetailSheet } from "@/components/live/player-detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFollowedClubs } from "@/hooks/use-followed-clubs";
import type { AppLocale, Dictionary } from "@/lib/i18n";
import type {
  ClubOverview as ClubOverviewData,
  ClubTournamentResponse,
  TournamentSummary,
} from "@/lib/types";
import {
  cn,
  formatScore,
  holeToLabel,
  isStartingListStatus,
} from "@/lib/utils";

async function fetchTournamentCatalog() {
  const response = await fetch("/api/tournaments", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to fetch tournaments");
  return (await response.json()) as { tournaments: TournamentSummary[] };
}

async function fetchTournamentClubs(tournamentId: string) {
  const response = await fetch(
    `/api/clubs?tournamentId=${encodeURIComponent(tournamentId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Failed to fetch tournament clubs");
  return (await response.json()) as ClubTournamentResponse;
}

function clubLabel(name: string) {
  return name
    .replace(/disc\s*golf/gi, "DG")
    .replace(/\s+e\.\s*v\.?$/i, "")
    .trim();
}

function ClubOverviewContent() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: catalog, isPending: catalogPending } = useQuery({
    queryKey: ["tournament-catalog"],
    queryFn: fetchTournamentCatalog,
    staleTime: 60_000,
  });
  const tournamentQueries = useQueries({
    queries: (catalog?.tournaments ?? []).map((tournament) => ({
      queryKey: ["clubs", tournament.id],
      queryFn: () => fetchTournamentClubs(tournament.id),
      refetchInterval: 25_000,
    })),
  });
  const { hydrated, isFollowed, toggleClub } = useFollowedClubs();
  const [query, setQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{
    player: ClubOverviewData["tournaments"][number]["players"][number];
    divisionPlayers: ClubOverviewData["tournaments"][number]["players"];
  } | null>(null);

  const clubMap = new Map<string, ClubOverviewData>();
  for (const queryResult of tournamentQueries) {
    const result = queryResult.data;
    if (!result) continue;
    for (const player of result.players) {
      if (!player.club) continue;
      const club = clubMap.get(player.club) ?? {
        name: player.club,
        tournaments: [],
      };
      let entry = club.tournaments.find(
        (item) => item.tournament.id === result.tournament.id,
      );
      if (!entry) {
        entry = {
          tournament: result.tournament,
          players: [],
          generatedAt: result.generatedAt,
        };
        club.tournaments.push(entry);
      }
      entry.players.push(player);
      clubMap.set(player.club, club);
    }
  }
  const data = [...clubMap.values()].sort((a, b) =>
    clubLabel(a.name).localeCompare(clubLabel(b.name)),
  );

  if (catalogPending || !catalog || !hydrated) {
    return <Skeleton className="h-[32rem] rounded-[28px]" />;
  }

  const filteredClubs = data.filter((club) =>
    club.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const requestedClub = searchParams.get("club");
  const selectedClub = data.find((club) => club.name === requestedClub);
  const visibleClubs = selectedClub
    ? [selectedClub]
    : data.filter((club) => isFollowed(club.name));

  function selectClub(clubName: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("club", clubName);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function clearSelectedClub() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("club");
    const query = params.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
          {t("clubs.eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("clubs.title")}
        </h1>
        <p className="max-w-xl text-sm text-muted">{t("clubs.description")}</p>
      </header>

      <section className="space-y-3 rounded-[24px] border border-border bg-surface p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("clubs.search")}
            aria-label={t("clubs.search")}
            className={cn("h-11 pl-10", query ? "pr-12" : "pr-4")}
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full"
              onClick={() => setQuery("")}
              aria-label={t("leaderboard.clearSearch")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
          {filteredClubs.map((club) => (
            <div
              key={club.name}
              className={cn(
                "flex h-10 items-center overflow-hidden rounded-full border",
                selectedClub?.name === club.name
                  ? "border-primary/40 bg-background"
                  : "border-border",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                onClick={() => toggleClub(club.name)}
                aria-label={
                  isFollowed(club.name)
                    ? t("clubs.unfollow", { name: club.name })
                    : t("clubs.follow", { name: club.name })
                }
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    isFollowed(club.name) && "fill-primary text-primary",
                  )}
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-full min-w-0 rounded-none px-3 text-left"
                onClick={() => selectClub(club.name)}
                aria-current={
                  selectedClub?.name === club.name ? "page" : undefined
                }
              >
                <span className="max-w-[16rem] truncate">
                  {clubLabel(club.name)}
                </span>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {visibleClubs.length === 0 ? (
        <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
          {t("clubs.empty")}
        </div>
      ) : (
        <>
          {selectedClub ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelectedClub}
              className="-ml-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("clubs.showFollowed")}
            </Button>
          ) : null}
          {visibleClubs.map((club) => (
            <section key={club.name} className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="font-display text-xl font-semibold">
                  {club.name}
                </h2>
                <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-muted">
                  {t("clubs.tournamentCount", {
                    count: club.tournaments.length,
                  })}
                </span>
              </div>
              {club.tournaments.map((entry) => (
                <article
                  key={entry.tournament.id}
                  className="rounded-[24px] border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <Link
                        href={`/${locale}?tournamentId=${encodeURIComponent(entry.tournament.id)}&club=${encodeURIComponent(club.name)}`}
                        className="font-display text-lg font-semibold hover:text-foreground"
                      >
                        {entry.tournament.name}
                      </Link>
                      <p className="mt-1 text-sm text-muted">
                        {entry.tournament.course} ·{" "}
                        {entry.tournament.roundLabel}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-[0.16em]",
                        entry.tournament.status === "live"
                          ? "text-negative"
                          : "text-muted",
                      )}
                    >
                      {t(`tournaments.status.${entry.tournament.status}`)}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {entry.players.map((player) => (
                      <button
                        key={player.playerId}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 text-left",
                          isStartingListStatus(entry.tournament.status)
                            ? "py-2 first:pt-3 last:pb-0"
                            : "py-3 first:pt-4 last:pb-0",
                        )}
                        onClick={() =>
                          setSelectedPlayer({
                            player,
                            divisionPlayers: entry.players,
                          })
                        }
                      >
                        {!isStartingListStatus(entry.tournament.status) ? (
                          <span className="w-8 shrink-0 font-display text-lg font-semibold">
                            #{player.rank}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {player.name}
                          </span>
                          {isStartingListStatus(
                            entry.tournament.status,
                          ) ? null : (
                            <span className="block truncate text-xs text-muted">
                              {player.division} · {holeToLabel(player.thru, t)}
                            </span>
                          )}
                        </span>
                        {!isStartingListStatus(entry.tournament.status) ? (
                          <span className="shrink-0 font-display text-xl font-semibold">
                            {formatScore(player.scoreToPar)}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </>
      )}
      <PlayerDetailSheet
        player={selectedPlayer?.player ?? null}
        divisionPlayers={selectedPlayer?.divisionPlayers ?? []}
        updates={[]}
        open={Boolean(selectedPlayer)}
        onOpenChange={(open) => {
          if (!open) setSelectedPlayer(null);
        }}
      />
    </div>
  );
}

export function ClubOverview({
  dictionary,
  locale,
}: {
  dictionary: Dictionary;
  locale: AppLocale;
}) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <ClubOverviewContent />
    </I18nProvider>
  );
}
