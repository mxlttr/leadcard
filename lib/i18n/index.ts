import de from "@/lib/i18n/locales/de.json";
import en from "@/lib/i18n/locales/en.json";

export const locales = ["en", "de"] as const;

export type AppLocale = (typeof locales)[number];
export type Dictionary = typeof en;

const dictionaries: Record<AppLocale, Dictionary> = {
  de,
  en,
};

export function isValidLocale(locale: string): locale is AppLocale {
  return locales.includes(locale as AppLocale);
}

export function getDictionary(locale: AppLocale): Dictionary {
  return dictionaries[locale];
}

export function createTranslator(dictionary: Dictionary) {
  return (key: string, params?: Record<string, string | number>) => {
    const value = key.split(".").reduce<unknown>((accumulator, segment) => {
      if (!accumulator || typeof accumulator !== "object") {
        return undefined;
      }

      return (accumulator as Record<string, unknown>)[segment];
    }, dictionary);

    if (typeof value !== "string") {
      return key;
    }

    return value.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
      return String(params?.[token] ?? "");
    });
  };
}
