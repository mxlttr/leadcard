import { notFound } from "next/navigation";

import { LiveLeaderboard } from "@/components/live/live-leaderboard";
import { getDictionary, isValidLocale, type AppLocale } from "@/lib/i18n";

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
        <LiveLeaderboard locale={locale} dictionary={dictionary} />
      </div>
    </main>
  );
}
