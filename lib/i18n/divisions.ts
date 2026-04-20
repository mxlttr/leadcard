import type { AppLocale } from "@/lib/i18n";

const englishDivisionReplacements: Array<[RegExp, string]> = [
  [/\bDamen\b/g, "Women"],
  [/\bJunioren\b/g, "Juniors"],
  [/\bHerren\b/g, "Men"],
];

function normalizeDivisionLabel(division: string) {
  return division.trim().toLocaleLowerCase("de-DE");
}

function divisionAge(division: string) {
  const match = normalizeDivisionLabel(division).match(/\b(\d{2})\b/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function divisionBucket(division: string) {
  const normalized = normalizeDivisionLabel(division);
  const isJunior =
    normalized.includes("junior") ||
    /^fj\d+/.test(normalized) ||
    /^mj\d+/.test(normalized);
  const isWomen =
    normalized.includes("damen") ||
    normalized.includes("women") ||
    /^fp\d+/.test(normalized) ||
    /^fa\d+/.test(normalized) ||
    normalized.startsWith("fpo");
  const isMaster =
    normalized.includes("master") ||
    normalized.includes("senior") ||
    /^mp\d+/.test(normalized) ||
    /^ma\d+/.test(normalized);
  const isOpen =
    normalized.includes("open") ||
    normalized.includes("herren") ||
    normalized.includes("men") ||
    normalized.startsWith("mpo") ||
    normalized.startsWith("ma1");

  if (isJunior) {
    return 4;
  }

  if (isWomen && isMaster) {
    return 3;
  }

  if (isMaster) {
    return 2;
  }

  if (isWomen) {
    return 1;
  }

  if (isOpen) {
    return 0;
  }

  return 5;
}

export function translateDivisionLabel(division: string, locale: AppLocale) {
  if (locale !== "en") {
    return division;
  }

  return englishDivisionReplacements.reduce((label, [pattern, replacement]) => {
    return label.replace(pattern, replacement);
  }, division);
}

export function compareDivisionLabels(a: string, b: string) {
  const bucketDelta = divisionBucket(a) - divisionBucket(b);

  if (bucketDelta !== 0) {
    return bucketDelta;
  }

  const ageDelta = divisionAge(a) - divisionAge(b);

  if (ageDelta !== 0) {
    return ageDelta;
  }

  return a.localeCompare(b, "de-DE", { sensitivity: "base" });
}

export function sortDivisionLabels(divisions: string[]) {
  return [...divisions].sort(compareDivisionLabels);
}
