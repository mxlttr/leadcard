"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Crown,
  Flag,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
import {
  buildRecentUpdatesFeed,
  leadContext,
  type MergedEvent,
} from "@/lib/recent-updates";
import type { RecentUpdate } from "@/lib/types";
import { formatUpdateText } from "@/lib/update-copy";
import {
  cn,
  formatRelativeTime,
  formatScore,
  holeToLabel,
  scoreTone,
} from "@/lib/utils";

function toneAccent(update: RecentUpdate) {
  if (update.tone === "positive") {
    return {
      border: "border-primary/25",
      line: "bg-primary",
      icon: "bg-primary/12 text-primary",
    };
  }

  if (update.tone === "negative") {
    return {
      border: "border-negative/25",
      line: "bg-negative",
      icon: "bg-negative/12 text-negative",
    };
  }

  return {
    border: "border-border",
    line: "bg-border",
    icon: "bg-background text-muted",
  };
}

function itemIcon(update: RecentUpdate) {
  if (update.rank === 1) {
    return Crown;
  }

  if (update.thru === "F") {
    return Flag;
  }

  return update.tone === "negative" ? ArrowDownRight : ArrowUpRight;
}

function eventMeta(
  update: RecentUpdate,
  locale: "en" | "de",
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const parts = [translateDivisionLabel(update.division, locale)];

  if (typeof update.rank === "number") {
    parts.push(`#${update.rank}`);
  }

  if (typeof update.scoreToPar === "number") {
    parts.push(formatScore(update.scoreToPar));
  }

  if (typeof update.thru !== "undefined") {
    parts.push(holeToLabel(update.thru, t));
  }

  return parts;
}

function EventLabel({ event }: { event: MergedEvent }) {
  const { t } = useI18n();

  if (event.type === "lead_change") {
    const key = event.updates.length > 1 ? "leadBattle" : "leadChange";
    return <>{t(`updates.labels.${key}`)}</>;
  }

  if (event.type === "top3_shuffle") {
    return <>{t("updates.labels.top3")}</>;
  }

  if (event.type === "finish") {
    return <>{t("updates.labels.finish")}</>;
  }

  return <>{t("updates.labels.surge")}</>;
}

function EventContext({ event }: { event: MergedEvent }) {
  const { t } = useI18n();

  if (event.type === "lead_change") {
    const strokes = leadContext(event);

    if (strokes) {
      return (
        <p className="mt-1 text-sm text-muted">
          {t("updates.context.leadsBy", { strokes })}
        </p>
      );
    }
  }

  if (event.type === "top3_shuffle" && event.updates.length > 1) {
    return (
      <p className="mt-1 text-sm text-muted">
        {t("updates.context.topThreeReshuffled")}
      </p>
    );
  }

  if (event.type === "finish") {
    return (
      <p className="mt-1 text-sm text-muted">
        {t("updates.context.playerFinished")}
      </p>
    );
  }

  return null;
}

function UpdateLine({
  update,
  fresh,
  onSelect,
  compact,
}: {
  update: RecentUpdate;
  fresh: boolean;
  onSelect?: (update: RecentUpdate) => void;
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const Icon = itemIcon(update);
  const accent = toneAccent(update);
  const updateText = formatUpdateText(update, t);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  const relativeTime = formatRelativeTime(update.createdAt, locale, now);
  const meta = eventMeta(update, locale, t);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(update)}
      className={cn(
        "group relative w-full overflow-hidden rounded-[18px] border bg-background text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        accent.border,
        compact
          ? "px-3.5 py-3 hover:bg-background/80"
          : "px-4 py-4 hover:bg-surface/70",
        onSelect ? "cursor-pointer active:scale-[0.995]" : "cursor-default",
        fresh && "animate-[feed-enter_420ms_ease-out]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1.5", accent.line)}
      />

      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full",
            accent.icon,
            compact ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <Icon className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p
              className={cn(
                "min-w-0 font-medium text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] overflow-hidden",
                compact
                  ? "text-sm leading-5 [-webkit-line-clamp:2]"
                  : "text-[15px] leading-6 [-webkit-line-clamp:3]",
              )}
            >
              {updateText}
            </p>
            {relativeTime ? (
              <span className="shrink-0 pt-0.5 text-[11px] tracking-[0.01em] text-muted">
                {relativeTime}
              </span>
            ) : null}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {meta.map((part, index) => (
              <span
                key={`${update.id}-${part}`}
                className="inline-flex items-center gap-2"
              >
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <span
                  className={
                    typeof update.scoreToPar === "number" &&
                    part === formatScore(update.scoreToPar)
                      ? cn(
                          "score-text font-semibold",
                          scoreTone(update.scoreToPar),
                        )
                      : undefined
                  }
                >
                  {part}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

function MergedEventItem({
  event,
  freshIds,
  onSelect,
}: {
  event: MergedEvent;
  freshIds: Set<string>;
  onSelect?: (update: RecentUpdate) => void;
}) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const displayTime = formatRelativeTime(event.createdAt, locale, now);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="rounded-[22px] border border-border bg-background/90 px-4 py-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <EventLabel event={event} />
          </div>
          <EventContext event={event} />
        </div>
        {displayTime ? (
          <span className="shrink-0 pt-1 text-[11px] tracking-[0.01em] text-muted">
            {displayTime}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {event.updates.map((update) => (
          <UpdateLine
            key={update.id}
            update={update}
            fresh={freshIds.has(update.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function KeyMomentsSection({
  events,
  freshIds,
  onSelectUpdate,
}: {
  events: MergedEvent[];
  freshIds: Set<string>;
  onSelectUpdate?: (update: RecentUpdate) => void;
}) {
  const { t } = useI18n();

  if (events.length === 0) {
    return null;
  }

  return (
    <section id="key-moments" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          {t("updates.keyMoments")}
        </h3>
        <span className="text-xs text-muted">{events.length}</span>
      </div>
      <div className="space-y-3">
        {events.map((event) => (
          <MergedEventItem
            key={event.id}
            event={event}
            freshIds={freshIds}
            onSelect={onSelectUpdate}
          />
        ))}
      </div>
    </section>
  );
}

function LatestUpdatesSection({
  updates,
  freshIds,
  onSelectUpdate,
}: {
  updates: RecentUpdate[];
  freshIds: Set<string>;
  onSelectUpdate?: (update: RecentUpdate) => void;
}) {
  const { t } = useI18n();

  if (updates.length === 0) {
    return null;
  }

  return (
    <section id="latest-updates" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          {t("updates.latest")}
        </h3>
        <span className="text-xs text-muted">{updates.length}</span>
      </div>
      <ScrollArea className={updates.length > 8 ? "h-[320px]" : "h-auto"}>
        <div className="space-y-3 pr-4">
          {updates.map((update, index) => (
            <div key={update.id} className="space-y-3">
              <UpdateLine
                update={update}
                compact
                fresh={freshIds.has(update.id)}
                onSelect={onSelectUpdate}
              />
              {index < updates.length - 1 ? <Separator /> : null}
            </div>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}

export function RecentUpdatesFeed({
  updates,
  onSelectUpdate,
}: {
  updates: RecentUpdate[];
  onSelectUpdate?: (update: RecentUpdate) => void;
}) {
  const { t } = useI18n();
  const { keyMoments, latestUpdates } = useMemo(
    () => buildRecentUpdatesFeed(updates),
    [updates],
  );
  const seenIds = useRef(new Set<string>());
  const initialized = useRef(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!initialized.current) {
      updates.forEach((update) => {
        seenIds.current.add(update.id);
      });
      initialized.current = true;
      return;
    }

    const newIds = updates
      .filter((update) => !seenIds.current.has(update.id))
      .map((update) => update.id);

    updates.forEach((update) => {
      seenIds.current.add(update.id);
    });

    if (newIds.length === 0) {
      return;
    }

    setFreshIds((current) => new Set([...current, ...newIds]));

    const timeout = window.setTimeout(() => {
      setFreshIds((current) => {
        const next = new Set(current);
        newIds.forEach((id) => {
          next.delete(id);
        });
        return next;
      });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [updates]);

  return (
    <Card id="recent-updates" className="border-border bg-surface shadow-none">
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">
                {t("updates.heading")}
              </h2>
              <p className="mt-1 text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {t("updates.description")}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="score-text text-lg font-semibold text-foreground">
                {updates.length}
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                {t("updates.latestTwenty")}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted">{t("updates.tapHint")}</p>
        </div>

        {updates.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-border bg-background px-4 py-6 text-sm text-muted">
            {t("updates.waiting")}
          </div>
        ) : (
          <div className="space-y-5">
            <KeyMomentsSection
              events={keyMoments}
              freshIds={freshIds}
              onSelectUpdate={onSelectUpdate}
            />
            <LatestUpdatesSection
              updates={latestUpdates}
              freshIds={freshIds}
              onSelectUpdate={onSelectUpdate}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
