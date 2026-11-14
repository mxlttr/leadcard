"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  MapPin,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppLocale, Dictionary } from "@/lib/i18n";
import type { TournamentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type CatalogResponse = { tournaments: TournamentSummary[] };
type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;
type CardKind = "live" | "recent" | "upcoming" | "older";
type TournamentFilter = "all" | "live" | "upcoming" | "past";

async function fetchTournamentCatalog(): Promise<CatalogResponse> {
  const response = await fetch("/api/tournaments", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to fetch tournaments");
  }

  return (await response.json()) as CatalogResponse;
}

function dateTime(date?: string) {
  return date ? Date.parse(`${date}T12:00:00Z`) : 0;
}

function formatDate(date: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function tournamentDates(tournament: TournamentSummary, locale: AppLocale) {
  if (!tournament.startDate) {
    return null;
  }

  const start = formatDate(tournament.startDate, locale);
  if (!tournament.endDate) {
    return start;
  }
  const end = formatDate(tournament.endDate, locale);
  return start === end ? start : `${start} – ${end}`;
}

function statusLabel(tournament: TournamentSummary, t: Translate) {
  if (tournament.status === "upcoming" && tournament.daysUntilStart) {
    return t("tournaments.status.inDays", {
      count: tournament.daysUntilStart,
    });
  }

  if (
    (tournament.status === "recent" || tournament.status === "finished") &&
    tournament.daysSinceEnd
  ) {
    return t("tournaments.status.finishedDaysAgo", {
      count: tournament.daysSinceEnd,
    });
  }

  return t(
    `tournaments.status.${tournament.status === "recent" ? "finished" : tournament.status}`,
  );
}

function TournamentLinkCard({
  tournament,
  locale,
  kind,
  t,
}: {
  tournament: TournamentSummary;
  locale: AppLocale;
  kind: CardKind;
  t: Translate;
}) {
  const dates = tournamentDates(tournament, locale);
  const isLive = tournament.status === "live";
  const isPast = kind === "recent" || kind === "older";
  const className = cn(
    "group block min-w-0 rounded-[22px] border bg-surface transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
    kind === "live" && isLive
      ? "border-negative/25 p-4 sm:p-5"
      : "border-border p-4",
  );

  const content = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "font-display font-semibold leading-snug text-foreground",
              kind === "live" && isLive ? "text-lg sm:text-xl" : "text-base",
            )}
          >
            {tournament.name}
          </h3>
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{tournament.course}</span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
            isLive
              ? "bg-negative/10 text-negative"
              : "bg-background text-muted",
          )}
        >
          {isLive ? (
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute h-full w-full animate-ping rounded-full bg-negative/60" />
              <span className="relative h-2 w-2 rounded-full bg-negative" />
            </span>
          ) : null}
          {statusLabel(tournament, t)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        {dates ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {dates}
          </span>
        ) : (
          <span />
        )}
        {isPast && tournament.hasResults === true ? (
          <span className="inline-flex items-center gap-1 font-medium text-foreground/80 group-hover:text-foreground">
            {t("overview.viewResults")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : isPast && tournament.hasResults === false ? (
          <span className="font-medium text-muted">
            {t("overview.noResults")}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <Link
      href={`/${locale}?tournamentId=${encodeURIComponent(tournament.id)}`}
      className={className}
    >
      {content}
    </Link>
  );
}

function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <h2
      id={id}
      className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.18em] text-muted"
    >
      {title}
    </h2>
  );
}

function TournamentOverviewContent() {
  const { locale, t } = useI18n();
  const catalogQuery = useQuery({
    queryKey: ["tournament-catalog"],
    queryFn: fetchTournamentCatalog,
    staleTime: 60_000,
  });
  const [query, setQuery] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TournamentFilter>("all");
  const catalog = catalogQuery.data?.tournaments ?? [];
  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase(locale === "de" ? "de-DE" : "en-GB");
  const filteredTournaments = normalizedQuery
    ? catalog.filter((tournament) =>
        `${tournament.name} ${tournament.course}`
          .toLocaleLowerCase(locale === "de" ? "de-DE" : "en-GB")
          .includes(normalizedQuery),
      )
    : catalog;
  const liveTournaments = filteredTournaments
    .filter(
      (tournament) =>
        ["live", "mock"].includes(tournament.status) ||
        (tournament.status === "finished" && tournament.daysSinceEnd === 0),
    )
    .sort(
      (a, b) =>
        Number(b.status === "live") - Number(a.status === "live") ||
        Number(a.status === "mock") - Number(b.status === "mock") ||
        dateTime(a.startDate) - dateTime(b.startDate),
    );
  const recentTournaments = filteredTournaments
    .filter(
      (tournament) =>
        tournament.status === "recent" ||
        (tournament.status === "finished" &&
          tournament.daysSinceEnd !== undefined &&
          tournament.daysSinceEnd > 0 &&
          tournament.daysSinceEnd <= 7),
    )
    .sort((a, b) => dateTime(b.endDate) - dateTime(a.endDate));
  const upcomingTournaments = filteredTournaments
    .filter((tournament) =>
      ["today", "tomorrow", "upcoming"].includes(tournament.status),
    )
    .sort((a, b) => dateTime(a.startDate) - dateTime(b.startDate));
  const olderTournaments = filteredTournaments
    .filter(
      (tournament) =>
        tournament.status === "finished" &&
        (tournament.daysSinceEnd === undefined || tournament.daysSinceEnd > 7),
    )
    .sort((a, b) => dateTime(b.endDate) - dateTime(a.endDate));
  const pastTournaments = [...recentTournaments, ...olderTournaments].sort(
    (a, b) => dateTime(b.endDate) - dateTime(a.endDate),
  );
  const visibleLiveTournaments =
    activeFilter === "all" || activeFilter === "live" ? liveTournaments : [];
  const visibleRecentTournaments =
    activeFilter === "all" ? recentTournaments : [];
  const visibleUpcomingTournaments =
    activeFilter === "all" || activeFilter === "upcoming"
      ? upcomingTournaments
      : [];
  const showOlderTournaments =
    activeFilter === "all" && (showOlder || Boolean(normalizedQuery));
  const hasVisibleTournaments =
    visibleLiveTournaments.length > 0 ||
    visibleRecentTournaments.length > 0 ||
    visibleUpcomingTournaments.length > 0 ||
    (activeFilter === "past" && pastTournaments.length > 0) ||
    (showOlderTournaments && olderTournaments.length > 0);

  if (catalogQuery.isPending) {
    return (
      <div
        className="space-y-7"
        role="status"
        aria-label={t("overview.loading")}
      >
        <Skeleton className="h-36 rounded-[24px]" />
        <Skeleton className="h-12 rounded-full" />
        <Skeleton className="h-44 rounded-[24px]" />
        <Skeleton className="h-32 rounded-[24px]" />
      </div>
    );
  }

  if (catalogQuery.isError && !catalogQuery.data) {
    return (
      <div
        className="rounded-[24px] border border-border bg-surface p-5"
        role="alert"
      >
        <p className="font-medium text-foreground">{t("overview.loadError")}</p>
        <p className="mt-1 text-sm text-muted">{t("overview.loadErrorHint")}</p>
        <Button
          type="button"
          variant="ghost"
          className="mt-4 rounded-full border border-border"
          onClick={() => void catalogQuery.refetch()}
        >
          {t("overview.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {t("overview.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("overview.title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            {t("overview.description")}
          </p>
        </div>

        <div className="relative">
          <label htmlFor="tournament-search" className="sr-only">
            {t("overview.searchLabel")}
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id="tournament-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("overview.searchPlaceholder")}
            className={cn("h-12 rounded-full pl-11", query ? "pr-12" : "pr-4")}
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full"
              onClick={() => setQuery("")}
              aria-label={t("overview.clearSearch")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <Tabs
          value={activeFilter}
          onValueChange={(value) => setActiveFilter(value as TournamentFilter)}
        >
          <TabsList aria-label={t("overview.filters.label")}>
            {(["all", "live", "upcoming", "past"] as const).map((filter) => (
              <TabsTrigger key={filter} value={filter}>
                {t(`overview.filters.${filter}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      {visibleLiveTournaments.length > 0 || activeFilter === "live" ? (
        <section
          className="space-y-3"
          aria-labelledby="live-tournaments-heading"
        >
          <SectionHeading
            id="live-tournaments-heading"
            title={t("overview.liveNow")}
          />
          {visibleLiveTournaments.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleLiveTournaments.map((tournament) => (
                <TournamentLinkCard
                  key={tournament.id}
                  tournament={tournament}
                  locale={locale}
                  kind="live"
                  t={t}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {visibleRecentTournaments.length > 0 ? (
        <section
          className="space-y-3"
          aria-labelledby="recent-tournaments-heading"
        >
          <SectionHeading
            id="recent-tournaments-heading"
            title={t("overview.recentlyFinished")}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleRecentTournaments.map((tournament) => (
              <TournamentLinkCard
                key={tournament.id}
                tournament={tournament}
                locale={locale}
                kind="recent"
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {visibleUpcomingTournaments.length > 0 ? (
        <section
          className="space-y-3"
          aria-labelledby="upcoming-tournaments-heading"
        >
          <SectionHeading
            id="upcoming-tournaments-heading"
            title={t("overview.comingUp")}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleUpcomingTournaments.map((tournament) => (
              <TournamentLinkCard
                key={tournament.id}
                tournament={tournament}
                locale={locale}
                kind="upcoming"
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {activeFilter === "past" && pastTournaments.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title={t("overview.pastTournaments")} />
          <div className="grid gap-3 lg:grid-cols-2">
            {pastTournaments.map((tournament) => (
              <TournamentLinkCard
                key={tournament.id}
                tournament={tournament}
                locale={locale}
                kind="recent"
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {activeFilter === "all" && olderTournaments.length > 0 ? (
        <section className="space-y-3">
          {!normalizedQuery ? (
            <Button
              type="button"
              variant="ghost"
              className="h-auto justify-between rounded-[18px] border border-border bg-surface px-4 py-3 text-left"
              onClick={() => setShowOlder((current) => !current)}
              aria-expanded={showOlder}
              aria-controls="older-tournament-results"
            >
              <span className="min-w-0">
                <span className="block font-medium text-foreground">
                  {showOlder
                    ? t("overview.hideOlder")
                    : t("overview.showOlder")}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t("overview.olderCount", { count: olderTournaments.length })}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "ml-3 h-4 w-4 shrink-0 transition-transform",
                  showOlder && "rotate-180",
                )}
                aria-hidden="true"
              />
            </Button>
          ) : null}
          <div
            id="older-tournament-results"
            hidden={!showOlderTournaments}
            className="space-y-3"
          >
            {showOlderTournaments ? (
              <>
                <SectionHeading title={t("overview.olderTournaments")} />
                <div className="grid gap-3 lg:grid-cols-2">
                  {olderTournaments.map((tournament) => (
                    <TournamentLinkCard
                      key={tournament.id}
                      tournament={tournament}
                      locale={locale}
                      kind="older"
                      t={t}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {!hasVisibleTournaments ? (
        <div className="rounded-[22px] border border-border bg-surface p-5 text-sm text-muted">
          {normalizedQuery && filteredTournaments.length === 0
            ? t("overview.noSearchResults")
            : activeFilter !== "all"
              ? t("overview.noFilterResults")
              : catalog.length === 0
                ? t("overview.emptyCatalog")
                : olderTournaments.length > 0
                  ? t("overview.noCurrentEvents")
                  : t("overview.emptyCatalog")}
        </div>
      ) : null}

      {catalogQuery.isError && catalogQuery.data ? (
        <p className="text-xs text-muted" role="status">
          {t("overview.refreshError")}
        </p>
      ) : null}
    </div>
  );
}

export function TournamentOverview({
  locale,
  dictionary,
}: {
  locale: AppLocale;
  dictionary: Dictionary;
}) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <TournamentOverviewContent />
    </I18nProvider>
  );
}
