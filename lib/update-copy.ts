import type { RecentUpdate } from "@/lib/types";
import { formatScore } from "@/lib/utils";

export function formatUpdateText(
  update: RecentUpdate,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const score =
    typeof update.scoreToPar === "number" ? formatScore(update.scoreToPar) : "";
  const rank = typeof update.rank === "number" ? `#${update.rank}` : "";
  const through =
    typeof update.thru === "number"
      ? t("updates.copy.throughSuffix", { hole: update.thru })
      : "";

  if (update.thru === "F") {
    return t("updates.copy.finishes", {
      name: update.playerName,
      score,
    });
  }

  if (update.rank === 1 && update.previousRank && update.previousRank !== 1) {
    return t("updates.copy.takesLead", {
      name: update.playerName,
      score,
    });
  }

  if (
    typeof update.rank === "number" &&
    typeof update.previousRank === "number" &&
    update.rank < update.previousRank
  ) {
    return t("updates.copy.climbs", {
      name: update.playerName,
      rank,
      score,
      through,
    });
  }

  if (
    typeof update.rank === "number" &&
    typeof update.previousRank === "number" &&
    update.rank > update.previousRank
  ) {
    return t("updates.copy.drops", {
      name: update.playerName,
      rank,
      score,
      through,
    });
  }

  if (update.rank === 1) {
    return t("updates.copy.holdsLead", {
      name: update.playerName,
      score,
      through,
    });
  }

  return t("updates.copy.holdsPosition", {
    name: update.playerName,
    rank,
    score,
    through,
  });
}
