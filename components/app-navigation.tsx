"use client";

import { Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { InstallAppOption } from "@/components/install-app-option";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { type AppLocale, type Dictionary, locales } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function NavigationContent() {
  const { locale, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const links = [
    { href: `/${locale}`, label: t("navigation.home") },
    { href: `/${locale}/clubs`, label: t("navigation.clubs") },
    { href: `/${locale}/board`, label: t("navigation.board") },
  ];

  function isActive(href: string) {
    return href === `/${locale}`
      ? pathname === href
      : pathname.startsWith(href);
  }

  return (
    <header className="mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
      <Link
        href={`/${locale}`}
        className="group flex min-w-0 items-center gap-3"
      >
        <span className="truncate font-display text-lg font-semibold tracking-tight">
          {t("app.name")}
        </span>
      </Link>

      <nav
        className="hidden items-center gap-1 md:flex"
        aria-label={t("navigation.label")}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              isActive(link.href)
                ? "bg-surface text-foreground"
                : "text-muted hover:text-foreground",
            )}
            aria-current={isActive(link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-1 rounded-full border border-border p-1 sm:flex">
          {locales.map((item) => (
            <Link
              key={item}
              href={`/${item}${pathname.replace(`/${locale}`, "")}`}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.16em]",
                item === locale ? "bg-surface text-foreground" : "text-muted",
              )}
            >
              {item}
            </Link>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden h-10 w-10 rounded-full border border-border p-0 sm:inline-flex"
          onClick={toggleTheme}
          aria-label={
            theme === "dark"
              ? t("theme.switchToLight")
              : t("theme.switchToDark")
          }
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border border-border p-0 md:hidden"
              aria-label={t("navigation.openMenu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader className="pr-8">
              <SheetTitle>{t("navigation.menu")}</SheetTitle>
              <SheetDescription>{t("navigation.description")}</SheetDescription>
            </SheetHeader>
            <nav className="mt-8 grid gap-2" aria-label={t("navigation.label")}>
              {links.map((link) => (
                <SheetClose asChild key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "rounded-[18px] border px-4 py-4 text-base font-medium",
                      isActive(link.href)
                        ? "border-primary/30 bg-background text-foreground"
                        : "border-border text-muted",
                    )}
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-8 grid gap-3 border-t border-border pt-5 sm:hidden">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {t("language.switcherLabel")}
              </p>
              <div className="flex gap-2">
                {locales.map((item) => (
                  <SheetClose asChild key={item}>
                    <Link
                      href={`/${item}${pathname.replace(`/${locale}`, "")}`}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm uppercase",
                        item === locale
                          ? "border-primary/30 bg-background"
                          : "border-border text-muted",
                      )}
                    >
                      {item}
                    </Link>
                  </SheetClose>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="justify-start border border-border"
                onClick={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                {theme === "dark"
                  ? t("theme.switchToLight")
                  : t("theme.switchToDark")}
              </Button>
              <InstallAppOption locale={locale} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

export function AppNavigation({
  locale,
  dictionary,
}: {
  locale: AppLocale;
  dictionary: Dictionary;
}) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <NavigationContent />
    </I18nProvider>
  );
}
