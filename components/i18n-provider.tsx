"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createTranslator, type AppLocale, type Dictionary } from "@/lib/i18n";

type I18nContextValue = {
  locale: AppLocale;
  dictionary: Dictionary;
  t: ReturnType<typeof createTranslator>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: AppLocale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      locale,
      dictionary,
      t: createTranslator(dictionary),
    }),
    [dictionary, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider.");
  }

  return context;
}
