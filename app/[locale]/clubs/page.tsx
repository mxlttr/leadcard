import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppNavigation } from "@/components/app-navigation";
import { ClubOverview } from "@/components/clubs/club-overview";
import { type AppLocale, getDictionary, isValidLocale } from "@/lib/i18n";

export default async function ClubsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  if (!isValidLocale(resolvedParams.locale)) notFound();
  const locale = resolvedParams.locale as AppLocale;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <AppNavigation locale={locale} dictionary={getDictionary(locale)} />
        <Suspense fallback={null}>
          <ClubOverview locale={locale} dictionary={getDictionary(locale)} />
        </Suspense>
      </div>
    </main>
  );
}
