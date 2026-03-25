import type { AppLocale } from "@/lib/i18n";

const englishDivisionReplacements: Array<[RegExp, string]> = [
  [/\bDamen\b/g, "Women"],
  [/\bJunioren\b/g, "Juniors"],
  [/\bHerren\b/g, "Men"],
];

export function translateDivisionLabel(division: string, locale: AppLocale) {
  if (locale !== "en") {
    return division;
  }

  return englishDivisionReplacements.reduce((label, [pattern, replacement]) => {
    return label.replace(pattern, replacement);
  }, division);
}
