import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { getArchive } from "@/lib/server/archive";
import {
  generateBilingualDraft,
  REPORT_DRAFT_PROMPT_VERSION,
} from "@/lib/server/reporting/drafts";
import { buildFactSheet } from "@/lib/server/reporting/fact-sheet";
import {
  buildReportMarkdown,
  localeDraft,
  type ReportLocale,
  reportPermalink,
  reportSlug,
} from "@/lib/server/reporting/markdown-export";
import {
  fetchOfficialResults,
  type OfficialResultsContext,
  parseOfficialResults,
} from "@/lib/server/reporting/official-results";
import {
  buildRatingComparisons,
  matchRatings,
  type RatingContext,
} from "@/lib/server/reporting/ratings";
import {
  fetchRatingContext,
  fetchRatingsSnapshot,
  ratingContextStatus,
} from "@/lib/server/reporting/ratings-client";
import { buildRatingsFactSheet } from "@/lib/server/reporting/ratings-fact-sheet";
import { scrapeSnapshot } from "@/lib/server/scraper";
import { UPDATE_LOGIC_VERSION } from "@/lib/server/update-engine";

loadEnvConfig(process.cwd());

function berlinDate(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysBetween(first: string, second: string) {
  const firstTime = Date.parse(`${first}T00:00:00Z`);
  const secondTime = Date.parse(`${second}T00:00:00Z`);
  return Math.round((secondTime - firstTime) / 86_400_000);
}

async function main() {
  const [command, target, version = UPDATE_LOGIC_VERSION] =
    process.argv.slice(2);
  if (
    ![
      "status",
      "backup",
      "replay",
      "upgrade",
      "facts",
      "draft",
      "drafts",
      "export-markdown",
      "ratings",
      "backfill-ob",
    ].includes(command)
  ) {
    throw new Error(
      "Usage: archive backfill-ob <tournament-id> | ratings capture | ratings facts | draft <tournament-id> [--model=<model-id>] [--allow-incomplete] | drafts <tournament-id> | export-markdown <tournament-id> --out-dir=<landing-repo> [--draft-id=<draft-id> --event-start=YYYY-MM-DD --event-end=YYYY-MM-DD] [--overwrite] | facts <tournament-id> [options] | status | backup <new-path> | upgrade <tournament-id|--all> | replay <tournament-id|--all> [installed-version]",
    );
  }
  const archive = getArchive();
  try {
    if (command === "backfill-ob") {
      if (!target) throw new Error("Specify a tournament ID");
      const response = await fetch(
        `https://turniere.discgolf.de/index.php?p=events&sp=live&id=${encodeURIComponent(target)}`,
        {
          cache: "no-store",
          headers: { "user-agent": "leadcard-mvp/0.1" },
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error(`Live scoring source returned HTTP ${response.status}`);
      const source = scrapeSnapshot(await response.text());
      if (!source.players.length)
        throw new Error("No players found in the live scorecard");
      const completedRounds = source.players.reduce(
        (count, player) =>
          count +
          (player.rounds?.filter((round) => round.thru === "F").length ?? 0),
        0,
      );
      if (completedRounds === 0)
        throw new Error("No completed rounds found; archive was not changed");
      console.log(
        JSON.stringify(
          {
            tournamentId: target,
            ...archive.backfillOutOfBounds(target, source.players),
          },
          null,
          2,
        ),
      );
    } else if (command === "ratings") {
      if (!target || target === "capture") {
        const snapshot = await fetchRatingsSnapshot();
        const previous = archive.latestRatingsSnapshot();
        archive.saveRatingsSnapshot(snapshot.payload, snapshot.contentHash);
        archive.markRatingsPolled();
        console.log(
          JSON.stringify(
            {
              itemCount: snapshot.itemCount,
              contentHash: snapshot.contentHash,
              changed: previous?.contentHash !== snapshot.contentHash,
              capturedAt: archive.latestRatingsSnapshot()?.capturedAt,
              snapshotCount: archive.ratingsSnapshotCount(),
            },
            null,
            2,
          ),
        );
      } else if (target === "facts") {
        const snapshots = archive.latestRatingsSnapshots(2);
        if (snapshots.length < 2)
          throw new Error("Need two distinct ratings snapshots to build facts");
        const releaseDate = berlinDate(snapshots[1].capturedAt);
        const events = archive.summaries().flatMap((tournament) => {
          if (!tournament.endDate) return [];
          const endDay = new Date(
            `${tournament.endDate}T00:00:00Z`,
          ).getUTCDay();
          const age = daysBetween(tournament.endDate, releaseDate);
          if (![0, 6].includes(endDay) || age < 0 || age > 4) return [];
          const state = archive.load(tournament.id);
          return state?.players.length
            ? [{ tournament, players: state.players }]
            : [];
        });
        const sourceFingerprint = createHash("sha256")
          .update(
            `${snapshots[0].contentHash}:${snapshots[1].contentHash}:${events
              .map((event) => event.tournament.id)
              .sort()
              .join(",")}`,
          )
          .digest("hex");
        const existing = archive.ratingsFactSheetForSource(sourceFingerprint);
        if (existing) {
          console.log(
            JSON.stringify(
              {
                facts: JSON.parse(existing.payload),
                saved: {
                  id: existing.id,
                  contentHash: existing.contentHash,
                  createdAt: existing.createdAt,
                  unchanged: true,
                },
              },
              null,
              2,
            ),
          );
          return;
        }
        const facts = await buildRatingsFactSheet(
          snapshots[0],
          snapshots[1],
          events,
        );
        const saved = archive.saveRatingsFactSheet({
          sourceFingerprint,
          contentHash: facts.contentHash,
          payload: JSON.stringify(facts),
        });
        console.log(
          JSON.stringify(
            {
              facts,
              saved: {
                id: saved.id,
                contentHash: saved.contentHash,
                createdAt: saved.createdAt,
              },
            },
            null,
            2,
          ),
        );
      } else {
        throw new Error("Use archive ratings capture or archive ratings facts");
      }
    } else if (command === "facts") {
      if (!target || target === "--all")
        throw new Error("Specify one tournament ID");
      const snapshots = archive.reportSnapshots(target);
      const options = process.argv.slice(3);
      const refreshRatings = options.includes("--refresh-ratings");
      const refreshResults = options.includes("--refresh-results");
      const resultsHtmlOption = options.find((arg) =>
        arg.startsWith("--results-html="),
      );
      if (refreshResults && resultsHtmlOption)
        throw new Error(
          "Use either --refresh-results or --results-html, not both",
        );
      const previous = archive.latestTournamentFactSheet(target);
      const officialResults: OfficialResultsContext | null = resultsHtmlOption
        ? parseOfficialResults(
            readFileSync(
              resultsHtmlOption.slice("--results-html=".length),
              "utf8",
            ),
            target,
          )
        : refreshResults
          ? await fetchOfficialResults(target)
          : (previous?.value.officialResults ?? null);
      const facts = buildFactSheet(snapshots, officialResults ?? undefined);
      const eventStartOption = options.find((arg) =>
        arg.startsWith("--event-start="),
      );
      const eventStart =
        eventStartOption?.slice("--event-start=".length) ?? null;
      if (eventStart && !Number.isFinite(Date.parse(eventStart)))
        throw new Error("--event-start must be a valid ISO date/time");
      const mappingsOption = options.find((arg) =>
        arg.startsWith("--mappings="),
      );
      const confirmedMappings = mappingsOption
        ? (JSON.parse(
            readFileSync(mappingsOption.slice("--mappings=".length), "utf8"),
          ) as RatingContext["confirmedMappings"])
        : undefined;
      const latest = snapshots.at(-1);
      if (!latest) throw new Error("No archived snapshots");
      let ratingContext: RatingContext | null = refreshRatings
        ? null
        : (archive.latestFactSheet(target, facts.contentHash)?.value
            .ratingContext ??
          previous?.value.ratingContext ??
          null);
      let ratingFetchError: string | null = null;
      if (refreshRatings) {
        try {
          ratingContext = await fetchRatingContext(latest.players, {
            eventStart,
            confirmedMappings,
          });
        } catch (error) {
          ratingFetchError =
            error instanceof Error
              ? error.message
              : "Unknown ratings API error";
          ratingContext = {
            sourceUrl: "https://api.syndikat.golf/ratings",
            retrievedAt: new Date().toISOString(),
            ratingDate: null,
            usage: eventStart ? "historical-backfill" : "event-time",
            eventStart,
            items: [],
            confirmedMappings,
            rawResponse: { fetchError: ratingFetchError },
          };
        }
      }
      const ratings = ratingContext
        ? matchRatings(latest.players, ratingContext)
        : [];
      const ratingComparisons = buildRatingComparisons(facts, ratings);
      const savedPayload = {
        facts,
        officialResults,
        ratingContext,
        ratings,
        ratingComparisons,
        ratingFetchError,
        ratingStatus: ratingContext ? ratingContextStatus(ratingContext) : null,
      };
      const contentHash = createHash("sha256")
        .update(JSON.stringify(savedPayload))
        .digest("hex");
      const saved = archive.saveFactSheet({
        tournamentId: target,
        sourceFingerprint: facts.contentHash,
        contentHash,
        payload: JSON.stringify(savedPayload),
      });
      console.log(
        JSON.stringify(
          {
            ...savedPayload,
            saved: {
              contentHash: saved.contentHash,
              createdAt: saved.createdAt,
            },
          },
          null,
          2,
        ),
      );
    } else if (command === "draft") {
      if (!target || target === "--all")
        throw new Error("Specify one tournament ID");
      const latest = archive.latestTournamentFactSheet(target);
      if (!latest) throw new Error("No saved fact sheet for this tournament");
      const facts = latest.value.facts as ReturnType<typeof buildFactSheet>;
      const draftOptions = process.argv.slice(3);
      const modelOption = draftOptions.find((arg) =>
        arg.startsWith("--model="),
      );
      const model = modelOption?.slice("--model=".length);
      const allowIncomplete = draftOptions.includes("--allow-incomplete");
      if (model !== undefined && !model.trim())
        throw new Error("--model must name an OpenAI model");
      const generated = await generateBilingualDraft(facts, {
        model,
        allowIncomplete,
      });
      const saved = archive.saveReportDraft({
        tournamentId: target,
        factSheetHash: latest.contentHash,
        promptVersion: REPORT_DRAFT_PROMPT_VERSION,
        model: generated.model,
        payload: JSON.stringify({
          ...generated.draft,
          usage: generated.usage,
          partial: !facts.completion.readyForReview,
        }),
      });
      console.log(
        JSON.stringify(
          {
            id: saved.id,
            tournamentId: saved.tournamentId,
            factSheetHash: saved.factSheetHash,
            promptVersion: saved.promptVersion,
            model: saved.model,
            createdAt: saved.createdAt,
            ...JSON.parse(saved.payload),
          },
          null,
          2,
        ),
      );
    } else if (command === "drafts") {
      if (!target || target === "--all")
        throw new Error("Specify one tournament ID");
      console.log(
        JSON.stringify(
          archive.reportDrafts(target).map((draft) => ({
            id: draft.id,
            tournamentId: draft.tournamentId,
            factSheetHash: draft.factSheetHash,
            promptVersion: draft.promptVersion,
            model: draft.model,
            createdAt: draft.createdAt,
            ...JSON.parse(draft.payload),
          })),
          null,
          2,
        ),
      );
    } else if (command === "export-markdown") {
      if (!target || target === "--all")
        throw new Error("Specify one tournament ID");
      if (!/^[A-Za-z0-9_-]+$/.test(target))
        throw new Error("Tournament ID contains unsupported path characters");
      const options = process.argv.slice(3);
      const value = (name: string) =>
        options
          .find((arg) => arg.startsWith(`--${name}=`))
          ?.slice(name.length + 3);
      const outDir = value("out-dir");
      if (!outDir?.trim()) throw new Error("Provide --out-dir=<landing-repo>");
      const latestSheet = archive.latestTournamentFactSheet(target);
      if (!latestSheet)
        throw new Error("No saved fact sheet for this tournament");
      const draftId = value("draft-id");
      const candidates = archive
        .reportDrafts(target)
        .filter((draft) => draft.factSheetHash === latestSheet.contentHash);
      const savedDraft = draftId
        ? candidates.find((draft) => String(draft.id) === draftId)
        : candidates[0];
      if (!savedDraft)
        throw new Error(
          draftId
            ? `Draft ${draftId} does not belong to the latest fact sheet`
            : "No draft exists for the latest fact sheet; generate one with archive draft first",
        );
      const facts = latestSheet.value.facts as ReturnType<
        typeof buildFactSheet
      >;
      const validDate = (date: string | undefined, option: string) => {
        if (!date) return undefined;
        const parsed = new Date(`${date}T00:00:00Z`);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== date
        )
          throw new Error(`--${option} must be a valid YYYY-MM-DD date`);
        return date;
      };
      const eventStart = validDate(
        value("event-start") ?? facts.tournament.startDate,
        "event-start",
      );
      const eventEnd = validDate(
        value("event-end") ?? facts.tournament.endDate,
        "event-end",
      );
      if (!eventStart || !eventEnd)
        throw new Error(
          "Event dates are missing; supply --event-start and --event-end",
        );
      if (eventEnd < eventStart)
        throw new Error("Event end date precedes start date");
      const savedDraftPayload = JSON.parse(savedDraft.payload) as Parameters<
        typeof localeDraft
      >[0] & { partial?: boolean };
      const overwrite = options.includes("--overwrite");
      const outputRoot = resolve(outDir);
      const existingMappings = archive.reportExports(target);
      const slug = reportSlug(facts.tournament.name, target);
      const files = (["en", "de"] as const).map((locale) => {
        const article = localeDraft(savedDraftPayload, locale);
        const fullDescription =
          locale === "en"
            ? `Results and highlights from ${facts.tournament.name} at ${facts.tournament.course}.`
            : `Ergebnisse und Höhepunkte: ${facts.tournament.name} auf dem Kurs ${facts.tournament.course}.`;
        const description =
          fullDescription.length <= 160
            ? fullDescription
            : `${fullDescription.slice(0, 157).trimEnd()}...`;
        const relativePath = join("content", "reports", locale, `${target}.md`);
        const filePath = resolve(outputRoot, relativePath);
        const priorPublication = existingMappings.find(
          (mapping) =>
            mapping.locale === locale &&
            mapping.filePath === relativePath &&
            mapping.status !== "draft-exported",
        );
        if (priorPublication)
          throw new Error(
            `${relativePath} is ${priorPublication.status}; use the editorial correction workflow instead of exporting over it`,
          );
        const content = buildReportMarkdown({
          tournamentId: target,
          locale,
          title: article.title,
          description,
          markdown: article.markdown,
          slug,
          publicationDate: savedDraft.createdAt.slice(0, 10),
          eventStart,
          eventEnd,
          factSheetHash: savedDraft.factSheetHash,
          factSheetVersion: String(facts.schemaVersion),
          promptVersion: savedDraft.promptVersion,
          model: savedDraft.model,
          generatedAt: savedDraft.createdAt,
          partialResults: savedDraftPayload.partial === true,
          reviewGaps: savedDraftPayload.partial
            ? facts.completion.gaps
            : undefined,
        });
        const exists = existsSync(filePath);
        const unchanged = exists && readFileSync(filePath, "utf8") === content;
        if (exists && !unchanged && !overwrite)
          throw new Error(
            `${filePath} already exists with different content; pass --overwrite`,
          );
        return { locale, relativePath, filePath, content, unchanged };
      });
      const written: Array<{
        locale: ReportLocale;
        file: string;
        permalink: string;
        status: string;
        unchanged: boolean;
      }> = [];
      for (const file of files) {
        const { locale, relativePath, filePath, content, unchanged } = file;
        if (!unchanged) {
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, content, "utf8");
        }
        const savedExport = archive.saveReportExport({
          tournamentId: target,
          locale,
          draftId: savedDraft.id,
          factSheetHash: savedDraft.factSheetHash,
          filePath: relativePath,
          permalink: reportPermalink(locale, slug),
        });
        written.push({
          locale,
          file: filePath,
          permalink: savedExport.permalink,
          status: savedExport.status,
          unchanged,
        });
      }
      console.log(
        JSON.stringify(
          { tournamentId: target, draftId: savedDraft.id, exports: written },
          null,
          2,
        ),
      );
    } else if (command === "status") {
      console.log(
        JSON.stringify(
          {
            integrity: archive.db.pragma("quick_check"),
            ratings: {
              snapshots: archive.ratingsSnapshotCount(),
              lastPollAt: archive.lastRatingsPollAt(),
              latest: archive.latestRatingsSnapshot()
                ? {
                    capturedAt: archive.latestRatingsSnapshot()?.capturedAt,
                    contentHash: archive.latestRatingsSnapshot()?.contentHash,
                  }
                : null,
              latestFactSheet: archive.latestRatingsFactSheet()
                ? {
                    id: archive.latestRatingsFactSheet()?.id,
                    contentHash: archive.latestRatingsFactSheet()?.contentHash,
                    createdAt: archive.latestRatingsFactSheet()?.createdAt,
                  }
                : null,
            },
            tournaments: archive.db
              .prepare(
                "SELECT t.id, t.active_version, (SELECT COUNT(*) FROM snapshots s WHERE s.tournament_id=t.id) AS snapshots, (SELECT COUNT(*) FROM updates u WHERE u.tournament_id=t.id AND u.version=t.active_version) AS updates FROM tournaments t",
              )
              .all(),
          },
          null,
          2,
        ),
      );
    } else if (command === "backup") {
      if (!target || existsSync(target))
        throw new Error("Backup destination must be a new file");
      mkdirSync(dirname(resolve(target)), { recursive: true });
      await archive.db.backup(resolve(target));
      console.log(`Backup saved: ${resolve(target)}`);
    } else if (command === "upgrade") {
      if (!target) throw new Error("Specify a tournament ID or --all");
      const ids =
        target === "--all" ? archive.summaries().map((t) => t.id) : [target];
      for (const id of ids) {
        const upgraded = archive.upgradeVersion(id);
        console.log(
          `${id}: ${upgraded ? `upgraded to ${UPDATE_LOGIC_VERSION}` : `already on ${UPDATE_LOGIC_VERSION}`}`,
        );
      }
    } else {
      if (!target) throw new Error("Specify a tournament ID or --all");
      if (version !== UPDATE_LOGIC_VERSION)
        throw new Error(
          `Installed update engine is ${UPDATE_LOGIC_VERSION}; an arbitrary version label cannot select different code`,
        );
      const ids =
        target === "--all" ? archive.summaries().map((t) => t.id) : [target];
      for (const id of ids)
        console.log(
          `${id}: rebuilt ${archive.replay(id, version)} updates using ${version}`,
        );
    }
  } finally {
    archive.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
