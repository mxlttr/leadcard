import type { RecentUpdate } from "@/lib/types";

export type MergedEventType =
  | "lead_change"
  | "top3_shuffle"
  | "finish"
  | "surge";

export type MergedEvent = {
  id: string;
  type: MergedEventType;
  division: string;
  updates: RecentUpdate[];
  createdAt: string;
};

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const EVENT_WINDOW_MS = 10 * 60 * 1000;

export function buildRecentUpdatesFeed(updates: RecentUpdate[]) {
  const deduped = dedupeRecentUpdates(updates);
  const keyMoments: MergedEvent[] = [];
  const consumedUpdateIds = new Set<string>();

  for (const update of deduped) {
    if (update.importance !== "high") {
      continue;
    }

    const type = eventTypeFor(update);

    if (!type) {
      continue;
    }

    const existingEvent = keyMoments.find((event) =>
      canMergeIntoEvent(event, update, type),
    );

    if (existingEvent) {
      if (type === "lead_change") {
        existingEvent.type = "lead_change";
      }

      existingEvent.updates.push(update);
      consumedUpdateIds.add(update.id);
      continue;
    }

    keyMoments.push({
      id: `${type}:${update.division}:${update.createdAt}:${update.id}`,
      type,
      division: update.division,
      updates: [update],
      createdAt: update.createdAt,
    });
    consumedUpdateIds.add(update.id);
  }

  for (const event of keyMoments) {
    event.updates.sort(compareEventUpdates);
  }

  keyMoments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    keyMoments,
    latestUpdates: deduped.filter(
      (update) => !consumedUpdateIds.has(update.id),
    ),
  };
}

export function leadContext(event: MergedEvent) {
  const leader = event.updates.find((update) => update.rank === 1);
  const secondPlace = event.updates.find((update) => update.rank === 2);

  if (
    !leader ||
    !secondPlace ||
    typeof leader.scoreToPar !== "number" ||
    typeof secondPlace.scoreToPar !== "number"
  ) {
    return null;
  }

  const gap = secondPlace.scoreToPar - leader.scoreToPar;

  return gap > 0 ? gap : null;
}

function dedupeRecentUpdates(updates: RecentUpdate[]) {
  const sorted = [...updates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return sorted.filter((update, index) => {
    const timestamp = new Date(update.createdAt).getTime();

    return !sorted.slice(0, index).some((existing) => {
      const existingTimestamp = new Date(existing.createdAt).getTime();

      return (
        existing.playerId === update.playerId &&
        existing.text === update.text &&
        Math.abs(existingTimestamp - timestamp) <= DEDUPE_WINDOW_MS
      );
    });
  });
}

function eventTypeFor(update: RecentUpdate): MergedEventType | null {
  if (update.rank === 1 && update.previousRank && update.previousRank !== 1) {
    return "lead_change";
  }

  if (update.thru === "F") {
    return "finish";
  }

  if (isTopThreeUpdate(update)) {
    return "top3_shuffle";
  }

  if (update.importance === "high") {
    return "surge";
  }

  return null;
}

function canMergeIntoEvent(
  event: MergedEvent,
  update: RecentUpdate,
  type: MergedEventType,
) {
  if (event.type !== type || event.division !== update.division) {
    const sameLeadBattleFamily =
      isLeadBattleType(event.type) && isLeadBattleType(type);

    if (!sameLeadBattleFamily || event.division !== update.division) {
      return false;
    }
  }

  const eventTimestamp = new Date(event.createdAt).getTime();
  const updateTimestamp = new Date(update.createdAt).getTime();

  if (Math.abs(eventTimestamp - updateTimestamp) > EVENT_WINDOW_MS) {
    return false;
  }

  if (type === "surge") {
    return event.updates.some(
      (eventUpdate) => eventUpdate.playerId === update.playerId,
    );
  }

  return true;
}

function compareEventUpdates(a: RecentUpdate, b: RecentUpdate) {
  if (
    typeof a.rank === "number" &&
    typeof b.rank === "number" &&
    a.rank !== b.rank
  ) {
    return a.rank - b.rank;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function isTopThreeUpdate(update: RecentUpdate) {
  return (
    (typeof update.rank === "number" && update.rank <= 3) ||
    (typeof update.previousRank === "number" && update.previousRank <= 3)
  );
}

function isLeadBattleType(type: MergedEventType) {
  return type === "lead_change" || type === "top3_shuffle";
}
