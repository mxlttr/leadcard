import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { AppLocale } from "@/lib/i18n";
import type { LeaderboardPlayer } from "@/lib/types";

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

export function formatRelativeTime(
  value: string,
  locale: AppLocale,
  now = Date.now(),
) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return timestampLabel(value, locale);
  }

  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSeconds < 45) {
    return locale === "de" ? "gerade eben" : "just now";
  }

  if (diffSeconds < 60 * 60) {
    const minutes = Math.max(1, Math.floor(diffSeconds / 60));
    return locale === "de" ? `vor ${minutes}m` : `${minutes}m ago`;
  }

  if (diffSeconds < 6 * 60 * 60) {
    const hours = Math.max(1, Math.floor(diffSeconds / (60 * 60)));
    return locale === "de" ? `vor ${hours}h` : `${hours}h ago`;
  }

  const date = new Date(timestamp);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return locale === "de" ? "Früher heute" : "Earlier today";
  }

  return "";
}

export function formatDivisionRank(
  player: LeaderboardPlayer,
  divisionPlayers: LeaderboardPlayer[],
) {
  const isTied = divisionPlayers.some(
    (divisionPlayer) =>
      divisionPlayer.playerId !== player.playerId &&
      divisionPlayer.division === player.division &&
      divisionPlayer.rank === player.rank,
  );

  return isTied ? `T${player.rank}` : `#${player.rank}`;
}
