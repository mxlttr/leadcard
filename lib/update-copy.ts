import type { AppLocale } from "@/lib/i18n";
import { translateDivisionLabel } from "@/lib/i18n/divisions";
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
  locale: AppLocale = "en",
) {
  if (update.kind === "round_complete") {
    return t("updates.copy.roundComplete", { round: update.round ?? "" });
  }

  if (update.kind === "tournament_complete") {
    if (update.tiedFirst?.length) {
      const ties = update.tiedFirst
        .map(({ division, players }) => `${division}: ${players.join(" / ")}`)
        .join("; ");
      return t("updates.copy.tournamentCompleteTie", { ties });
    }
    return t("updates.copy.tournamentComplete");
  }

  if (update.kind === "opening_birdie") {
    return t(copyVariant(update, "updates.copy.openingBirdie"), {
      name: update.playerName,
      hole: update.hole ?? "",
    });
  }

  if (update.kind === "clubhouse_lead") {
    const key =
      update.strokes === 1
        ? "updates.copy.clubhouseLeadOne"
        : "updates.copy.clubhouseLead";
    return t(copyVariant(update, key), {
      name: update.playerName,
      score:
        typeof update.scoreToPar === "number"
          ? formatScore(update.scoreToPar)
          : "",
      strokes: update.strokes ?? 0,
    });
  }

  if (update.kind === "round_stats_summary") {
    const samePlayerLeadsBoth =
      update.statLeaders?.length === 1 &&
      update.statLeaders[0] === update.bogeyLeaderName;
    const key =
      update.statCount !== undefined
        ? update.bogeyLeaderName
          ? samePlayerLeadsBoth
            ? "updates.copy.roundStatsBothSame"
            : "updates.copy.roundStatsBoth"
          : "updates.copy.roundStatsBirdies"
        : update.bogeyCount === 0
          ? "updates.copy.roundStatsBogeysClean"
          : "updates.copy.roundStatsBogeys";
    return t(copyVariant(update, key), {
      leaders:
        update.statLeaders?.join(` ${t("updates.copy.listJoiner")} `) ?? "",
      birdies: update.statCount ?? 0,
      bogeyLeader: update.bogeyLeaderName ?? "",
      bogeys: update.bogeyCount ?? 0,
      holes: update.holesPlayed ?? 0,
    });
  }

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

  if (update.kind === "hole_rank_move") {
    const relativeToPar = update.holeRelativeToPar;
    const shot =
      relativeToPar === undefined
        ? t("updates.scores.unknown")
        : relativeToPar <= -5
          ? t("updates.scores.underPar", { strokes: Math.abs(relativeToPar) })
          : relativeToPar === -4
            ? t("updates.scores.condor")
            : relativeToPar === -3
              ? t("updates.scores.albatross")
              : relativeToPar === -2
                ? t("updates.scores.eagle")
                : relativeToPar === -1
                  ? t("updates.scores.birdie")
                  : relativeToPar === 0
                    ? t("updates.scores.par")
                    : relativeToPar === 1
                      ? t("updates.scores.bogey")
                      : relativeToPar === 2
                        ? t("updates.scores.doubleBogey")
                        : relativeToPar === 3
                          ? t("updates.scores.tripleBogey")
                          : t("updates.scores.overPar", {
                              strokes: relativeToPar,
                            });
    return t(
      relativeToPar !== undefined && relativeToPar < 0
        ? "updates.copy.scoreMovesUp"
        : "updates.copy.scoreDropsDown",
      { name: update.playerName, hole: update.hole ?? "", rank, shot },
    );
  }

  if (update.thru === "F") {
    if (update.kind === "round_top_three_finish") {
      const params = {
        name: update.playerName,
        division: translateDivisionLabel(update.division, locale),
        round: update.round ?? "",
        place: finishPlace(
          typeof update.rank === "number" ? update.rank : null,
          t,
        ),
      };
      return t(
        update.tiedForLead
          ? "updates.copy.roundTiedLeaderFinish"
          : update.rank === 1
            ? "updates.copy.roundLeaderFinish"
            : "updates.copy.roundPlaceFinish",
        params,
      );
    }

    const params = {
      name: update.playerName,
      division: translateDivisionLabel(update.division, locale),
      place: finishPlace(
        typeof update.rank === "number" ? update.rank : null,
        t,
      ),
    };

    if (update.kind === "podium_finish") {
      const key = update.tiedForLead
        ? "updates.copy.tiedFirstFinish"
        : update.rank === 1
          ? "updates.copy.divisionWinner"
          : update.rank === 2
            ? "updates.copy.divisionRunnerUp"
            : "updates.copy.divisionThirdPlace";
      return t(key, params);
    }

    return t("updates.copy.divisionFinish", params);
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
