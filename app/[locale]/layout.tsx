import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  getDictionary,
  isValidLocale,
  locales,
  type AppLocale,
} from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  if (!isValidLocale(resolvedParams.locale)) {
    return {};
  }

  const dictionary = getDictionary(resolvedParams.locale as AppLocale);

  return {
    title: dictionary.meta.title,
    description: dictionary.meta.description,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;

  if (!isValidLocale(resolvedParams.locale)) {
    notFound();
  }

  return children;
}
