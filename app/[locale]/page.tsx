import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppNavigation } from "@/components/app-navigation";
import { LiveLeaderboard } from "@/components/live/live-leaderboard";
import {
  type AppLocale,
  createTranslator,
  getDictionary,
  isValidLocale,
} from "@/lib/i18n";
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
  const translate = createTranslator(dictionary);
  const requestedTournamentId = (await searchParams).tournamentId;
  let tournament: { id: string; name: string; course: string } | undefined;

  try {
    const tournaments = await getTournamentCatalog();
    const tournamentId =
      requestedTournamentId ?? (await getDefaultTournamentId());
    tournament = tournaments.find((item) => item.id === tournamentId);
  } catch {
    tournament = undefined;
  }

  const title = tournament
    ? translate("meta.tournamentTitle", {
        name: tournament.name,
        app: dictionary.app.title,
      })
    : dictionary.meta.title;
  const description = tournament
    ? translate("meta.tournamentDescription", {
        name: tournament.name,
        course: tournament.course,
      })
    : dictionary.meta.description;
  const pageUrl = `/${locale}${
    tournament ? `?tournamentId=${encodeURIComponent(tournament.id)}` : ""
  }`;
  const imageUrl = new URL(
    "/api/og",
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://leadcard.lutter.lol",
  );
  imageUrl.searchParams.set("locale", locale);
  if (tournament) {
    imageUrl.searchParams.set("tournamentId", tournament.id);
  }

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title,
      description,
      locale,
      url: pageUrl,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: tournament ? `${tournament.name} · Leadcard` : "Leadcard",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
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
