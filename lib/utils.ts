import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { AppLocale } from "@/lib/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(scoreToPar: number) {
  if (scoreToPar === 0) {
    return "E";
  }

  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

export function scoreTone(scoreToPar: number) {
  if (scoreToPar < 0) {
    return "text-primary";
  }

  if (scoreToPar > 0) {
    return "text-negative";
  }

  return "text-foreground";
}

export function holeToLabel(
  thru: number | "F",
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return thru === "F"
    ? t("holes.finished")
    : t("holes.through", { count: thru });
}

export function timestampLabel(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
