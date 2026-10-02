import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppNavigation } from "@/components/app-navigation";
import { LiveLeaderboard } from "@/components/live/live-leaderboard";
import { type AppLocale, getDictionary, isValidLocale } from "@/lib/i18n";
import {
  getDefaultTournamentId,
  getTournamentCatalog,
} from "@/lib/server/tournament-source";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tournamentId?: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;

  if (!isValidLocale(resolvedParams.locale)) {
    return {};
  }

  const locale = resolvedParams.locale as AppLocale;
  const dictionary = getDictionary(locale);
  const requestedTournamentId = (await searchParams).tournamentId;
  let tournament: { name: string; course: string } | undefined;

  try {
    const tournaments = await getTournamentCatalog();
    const tournamentId =
      requestedTournamentId ?? (await getDefaultTournamentId());
    tournament = tournaments.find((item) => item.id === tournamentId);
  } catch {
    tournament = undefined;
  }

  const title = tournament
    ? `${tournament.name} · ${dictionary.app.title}`
    : dictionary.meta.title;
  const description = tournament
    ? `${dictionary.app.title}: ${tournament.name} at ${tournament.course}.`
    : dictionary.meta.description;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;

  if (!isValidLocale(resolvedParams.locale)) {
    notFound();
  }

  const locale = resolvedParams.locale as AppLocale;
  const dictionary = getDictionary(locale);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <AppNavigation locale={locale} dictionary={dictionary} />
        <Suspense fallback={null}>
          <LiveLeaderboard locale={locale} dictionary={dictionary} />
        </Suspense>
      </div>
    </main>
  );
}
