"use client";

import { useEffect } from "react";

import type { AppLocale } from "@/lib/i18n";

export function HtmlLang({ locale }: { locale: AppLocale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
