import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LiveBoard } from "@/components/board/live-board";
import { type AppLocale, getDictionary, isValidLocale } from "@/lib/i18n";

export default async function LocaleBoardPage({
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-4 sm:px-6 sm:py-6 xl:px-8">
        <Suspense fallback={null}>
          <LiveBoard locale={locale} dictionary={dictionary} />
        </Suspense>
      </div>
    </main>
  );
}
