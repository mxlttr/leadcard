"use client";

import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { RecentUpdate } from "@/lib/types";
import { timestampLabel } from "@/lib/utils";

function toneVariant(tone: RecentUpdate["tone"]) {
  if (tone === "positive") {
    return "primary";
  }

  if (tone === "negative") {
    return "negative";
  }

  return "default";
}

export function RecentUpdatesList({ updates }: { updates: RecentUpdate[] }) {
  const { locale, t } = useI18n();

  return (
    <Card className="border-border bg-surface shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">
              {t("updates.heading")}
            </h2>
            <p className="text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {t("updates.description")}
            </p>
          </div>
          <Badge className="shrink-0">{t("updates.latestTwenty")}</Badge>
        </div>

        <ScrollArea className="h-[260px]">
          <div className="space-y-3 pr-4">
            {updates.length === 0 ? (
              <div className="rounded-[18px] border border-border bg-background px-4 py-5 text-sm text-muted">
                {t("updates.waiting")}
              </div>
            ) : (
              updates.map((update, index) => (
                <div
                  key={`${update.playerId}-${update.createdAt}-${update.text}`}
                  className="space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {update.playerName}
                      </p>
                      <Badge variant={toneVariant(update.tone)}>
                        {t(`updates.${update.tone}`)}
                      </Badge>
                      <p className="text-sm text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                        {update.text}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {timestampLabel(update.createdAt, locale)}
                    </span>
                  </div>
                  {index < updates.length - 1 ? <Separator /> : null}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
