"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFollowedClubs } from "@/hooks/use-followed-clubs";
import type { AppLocale, Dictionary } from "@/lib/i18n";
import type { ClubsResponse } from "@/lib/types";
import { cn, formatScore, holeToLabel } from "@/lib/utils";

async function fetchClubs() {
  const response = await fetch("/api/clubs", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to fetch clubs");
  return (await response.json()) as ClubsResponse;
}

function ClubOverviewContent() {
  const { locale, t } = useI18n();
  const { data, isPending } = useQuery({
    queryKey: ["clubs"],
    queryFn: fetchClubs,
    refetchInterval: 25_000,
  });
  const { hydrated, isFollowed, toggleClub } = useFollowedClubs();
  const [query, setQuery] = useState("");

  if (isPending || !data || !hydrated) {
    return <Skeleton className="h-[32rem] rounded-[28px]" />;
  }

  const filteredClubs = data.clubs.filter((club) =>
    club.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const visibleClubs = data.clubs.filter((club) => isFollowed(club.name));

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
            className="h-11 pl-10"
          />
        </div>
        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
          {filteredClubs.map((club) => (
            <Button
              key={club.name}
              type="button"
              variant={isFollowed(club.name) ? "accent" : "ghost"}
              className={cn(
                "h-10 rounded-full border px-3",
                !isFollowed(club.name) && "border-border",
              )}
              onClick={() => toggleClub(club.name)}
              aria-label={
                isFollowed(club.name)
                  ? t("clubs.unfollow", { name: club.name })
                  : t("clubs.follow", { name: club.name })
              }
            >
              <Star
                className={cn(
                  "mr-2 h-3.5 w-3.5",
                  isFollowed(club.name) && "fill-current",
                )}
              />
              <span className="max-w-[16rem] truncate">{club.name}</span>
            </Button>
          ))}
        </div>
      </section>

      {visibleClubs.length === 0 ? (
        <div className="rounded-[24px] border border-border bg-surface p-5 text-sm text-muted">
          {t("clubs.empty")}
        </div>
      ) : (
        visibleClubs.map((club) => (
          <section key={club.name} className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="font-display text-xl font-semibold">
                {club.name}
              </h2>
              <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-muted">
                {t("clubs.tournamentCount", { count: club.tournaments.length })}
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
                      className="font-display text-lg font-semibold hover:text-primary"
                    >
                      {entry.tournament.name}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {entry.tournament.course} · {entry.tournament.roundLabel}
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
                    <Link
                      key={player.playerId}
                      href={`/${locale}?tournamentId=${encodeURIComponent(entry.tournament.id)}&division=${encodeURIComponent(player.division)}`}
                      className="flex items-center gap-3 py-3 first:pt-4 last:pb-0"
                    >
                      <span className="w-8 shrink-0 font-display text-lg font-semibold">
                        #{player.rank}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {player.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {player.division} · {holeToLabel(player.thru, t)}
                        </span>
                      </span>
                      <span className="shrink-0 font-display text-xl font-semibold">
                        {formatScore(player.scoreToPar)}
                      </span>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ))
      )}
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
