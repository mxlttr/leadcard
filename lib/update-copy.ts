import type { RecentUpdate } from "@/lib/types";
import { formatScore } from "@/lib/utils";

function copyVariant(update: RecentUpdate, key: string) {
  let hash = 0;
  for (const character of update.id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${key}${hash % 3 === 0 ? "" : `Alt${(hash % 3) + 1}`}`;
}

export function formatUpdateText(
  update: RecentUpdate,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const ace = update.text.match(/hits an ace on hole (\d+)/);
  if (ace || update.kind === "ace") {
    return t(copyVariant(update, "updates.copy.ace"), {
      name: update.playerName,
      hole: ace?.[1] ?? "",
    });
  }

  const eagle = update.text.match(/scores an eagle on hole (\d+)/);
  if (eagle || update.kind === "eagle") {
    return t(copyVariant(update, "updates.copy.eagle"), {
      name: update.playerName,
      hole: eagle?.[1] ?? "",
    });
  }

  const turkey = update.text.match(/scores a turkey on holes (.+)$/);
  if (turkey || update.kind === "strong_stretch") {
    return t(copyVariant(update, "updates.copy.turkey"), {
      name: update.playerName,
      holes: turkey?.[1] ?? "",
    });
  }

  const score =
    typeof update.scoreToPar === "number" ? formatScore(update.scoreToPar) : "";
  const rank = typeof update.rank === "number" ? `#${update.rank}` : "";
  const through =
    typeof update.thru === "number"
      ? t("updates.copy.throughSuffix", { hole: update.thru })
      : "";

  if (update.thru === "F") {
    return t(
      copyVariant(
        update,
        update.kind === "podium_finish"
          ? "updates.copy.podiumFinish"
          : "updates.copy.finishes",
      ),
      {
        name: update.playerName,
        place: finishPlace(
          typeof update.rank === "number" ? update.rank : null,
          t,
        ),
      },
    );
  }

  if (update.rank === 1 && update.previousRank && update.previousRank !== 1) {
    return t(copyVariant(update, "updates.copy.takesLead"), {
      name: update.playerName,
      score,
    });
  }

  if (update.kind === "lead_gap_closed") {
    return t(copyVariant(update, "updates.copy.closesLeadGap"), {
      name: update.playerName,
      strokes: update.strokes ?? 0,
      rank,
      score,
      through,
    });
  }

  if (update.kind === "top_three_entry") {
    return t(copyVariant(update, "updates.copy.entersTopThree"), {
      name: update.playerName,
      rank,
      score,
      through,
    });
  }

  if (
    typeof update.rank === "number" &&
    typeof update.previousRank === "number" &&
    update.rank < update.previousRank
  ) {
    const distance = Math.abs(update.previousRank - update.rank);
    return t(
      copyVariant(
        update,
        update.kind === "biggest_mover"
          ? "updates.copy.biggestMover"
          : "updates.copy.climbs",
      ),
      {
        name: update.playerName,
        distance: `${distance} ${t(
          distance === 1
            ? "updates.copy.oneSpot"
            : "updates.copy.multipleSpots",
        )}`,
        rank,
        score,
        through,
      },
    );
  }

  if (
    typeof update.rank === "number" &&
    typeof update.previousRank === "number" &&
    update.rank > update.previousRank
  ) {
    const distance = Math.abs(update.rank - update.previousRank);
    return t(copyVariant(update, "updates.copy.drops"), {
      name: update.playerName,
      distance: `${distance} ${t(
        distance === 1 ? "updates.copy.oneSpot" : "updates.copy.multipleSpots",
      )}`,
      rank,
      score,
      through,
    });
  }

  if (update.rank === 1) {
    return t(copyVariant(update, "updates.copy.holdsLead"), {
      name: update.playerName,
      score,
      through,
    });
  }

  return t(copyVariant(update, "updates.copy.holdsPosition"), {
    name: update.playerName,
    rank,
    score,
    through,
  });
}

function finishPlace(
  rank: number | null,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (rank === null || !Number.isInteger(rank) || rank < 1) {
    return "";
  }

  if (rank <= 10) {
    return t(`updates.copy.finishPlaces.${rank}`);
  }

  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : rank % 10 === 1
        ? "st"
        : rank % 10 === 2
          ? "nd"
          : rank % 10 === 3
            ? "rd"
            : "th";

  return t("updates.copy.otherFinishPlace", { rank, suffix });
}
