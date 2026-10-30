import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { seasons, competitions, competitionSeasons, teams, matches, syncLogs } from "../db/schema/index.js";
import { teamExternalId, normalizeTeamName } from "./openfootball-ids.js";
import { computeCurrentFootballSeason, UNSUPPORTED_COMPETITIONS } from "./openfootball-config.js";
import type { BulkFootballDataProvider, NormalizedCompetitionDataset } from "./bulk-provider.js";

export type CompetitionSyncResult = {
  code: string;
  name: string;
  source: "OPENFOOTBALL" | "FOOTBALL_DATA_ORG";
  status: "SUCCESS" | "FAILED";
  matchesUpserted: number;
  teamsUpserted: number;
  finishedMatches: number;
  upcomingMatches: number;
  error?: string;
  warnings: string[];
};

export type OpenFootballSyncReport = {
  sources: ("OPENFOOTBALL" | "FOOTBALL_DATA_ORG")[];
  seasonExternalId: string;
  seasonDisplay: string;
  competitionsAttempted: number;
  competitionsSucceeded: number;
  competitions: CompetitionSyncResult[];
  unsupportedCompetitions: { name: string; reason: string }[];
  totalTeamsUpserted: number;
  totalMatchesUpserted: number;
  errors: string[];
  warnings: string[];
  /** True only if at least one competition imported successfully. */
  ok: boolean;
};

async function upsertTeamsForFixtures(
  dataset: NormalizedCompetitionDataset,
  source: "OPENFOOTBALL" | "FOOTBALL_DATA_ORG"
): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const f of dataset.fixtures) {
    names.add(normalizeTeamName(f.homeTeamName));
    names.add(normalizeTeamName(f.awayTeamName));
  }

  const idByName = new Map<string, string>();
  for (const name of names) {
    const externalId = teamExternalId(name);
    // Cross-provider dedup by real-world name (via the deterministic
    // externalId above): if OpenFootball already created "Arsenal FC" from
    // the Premier League, a Champions League fixture involving Arsenal
    // reuses that exact row instead of creating a second "Arsenal FC" under
    // football-data.org — same fix as the earlier competitions/teams
    // dedup bug, applied proactively here instead of after the fact.
    const [row] = await db
      .insert(teams)
      .values({ externalId, name, country: dataset.country, source })
      .onConflictDoUpdate({ target: teams.externalId, set: { name, updatedAt: new Date() } })
      .returning();
    idByName.set(name, row.id);
  }
  return idByName;
}

async function upsertMatchesForCompetition(
  dataset: NormalizedCompetitionDataset,
  seasonRowId: string,
  competitionRowId: string,
  teamIdByName: Map<string, string>,
  source: "OPENFOOTBALL" | "FOOTBALL_DATA_ORG"
): Promise<{ upserted: number; finished: number; upcoming: number }> {
  let upserted = 0;
  let finished = 0;
  let upcoming = 0;

  for (const f of dataset.fixtures) {
    const homeTeamId = teamIdByName.get(normalizeTeamName(f.homeTeamName)) ?? null;
    const awayTeamId = teamIdByName.get(normalizeTeamName(f.awayTeamName)) ?? null;
    const status = f.matchlogStatus ?? (f.finished ? "FINISHED" : "SCHEDULED");
    const maxWatchMinutes = f.isKnockout ? 120 : 90;

    await db
      .insert(matches)
      .values({
        externalId: f.externalId,
        seasonId: seasonRowId,
        competitionId: competitionRowId,
        homeTeamId,
        awayTeamId,
        kickoffAt: f.kickoffAt,
        status,
        source,
        kickoffTimeConfirmed: f.kickoffTimeConfirmed,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        wentToExtraTime: f.wentToExtraTime,
        wentToPenalties: f.wentToPenalties,
        homePenalties: f.homePenalties,
        awayPenalties: f.awayPenalties,
        round: f.round,
        isKnockout: f.isKnockout,
        maxWatchMinutes,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: matches.externalId,
        set: {
          status,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          wentToExtraTime: f.wentToExtraTime,
          wentToPenalties: f.wentToPenalties,
          homePenalties: f.homePenalties,
          awayPenalties: f.awayPenalties,
          kickoffAt: f.kickoffAt,
          kickoffTimeConfirmed: f.kickoffTimeConfirmed,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    upserted++;
    if (f.finished) finished++;
    else upcoming++;
  }

  return { upserted, finished, upcoming };
}

/**
 * Syncs a single competition end-to-end: fetch -> upsert competition ->
 * upsert teams -> attach to the active season -> upsert matches. Exposed
 * (not just used internally by the full multi-competition sync) so the
 * match-status/result sync (Phase 3) can re-run this for just the
 * competitions that actually need a refresh, instead of duplicating the
 * upsert logic.
 */
export async function syncOneCompetition(
  provider: BulkFootballDataProvider,
  summary: { code: string; name: string; country: string },
  seasonExternalId: string
): Promise<{ result: CompetitionSyncResult; dataset: NormalizedCompetitionDataset | null }> {
  try {
    const dataset = await provider.fetchCompetitionSeason(summary.code, seasonExternalId);

    const namespace = provider.sourceName === "OPENFOOTBALL" ? "off" : "fdo";
    const [competitionRow] = await db
      .insert(competitions)
      .values({
        externalId: `${namespace}:comp:${summary.code}`,
        name: summary.name,
        country: summary.country,
        type: summary.code.toLowerCase() === "cl" ? "cup" : "league",
        isKnockout: summary.code.toLowerCase() === "cl",
        source: provider.sourceName,
        isSupported: true,
      })
      .onConflictDoUpdate({
        target: competitions.externalId,
        set: { name: summary.name, country: summary.country, source: provider.sourceName, isSupported: true, updatedAt: new Date() },
      })
      .returning();

    const teamIdByName = await upsertTeamsForFixtures(dataset, provider.sourceName);

    const seasonRow = await db.query.seasons.findFirst({ where: eq(seasons.externalId, seasonExternalId) });
    if (!seasonRow) {
      throw new Error(`Season ${seasonExternalId} doesn't exist yet — run a full fixture sync first.`);
    }

    await db.insert(competitionSeasons).values({ competitionId: competitionRow.id, seasonId: seasonRow.id }).onConflictDoNothing();

    const { upserted, finished, upcoming } = await upsertMatchesForCompetition(
      dataset,
      seasonRow.id,
      competitionRow.id,
      teamIdByName,
      provider.sourceName
    );

    return {
      result: {
        code: summary.code,
        name: summary.name,
        source: provider.sourceName,
        status: "SUCCESS",
        matchesUpserted: upserted,
        teamsUpserted: teamIdByName.size,
        finishedMatches: finished,
        upcomingMatches: upcoming,
        warnings: dataset.warnings,
      },
      dataset,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: {
        code: summary.code,
        name: summary.name,
        source: provider.sourceName,
        status: "FAILED",
        matchesUpserted: 0,
        teamsUpserted: 0,
        finishedMatches: 0,
        upcomingMatches: 0,
        error: message,
        warnings: [],
      },
      dataset: null,
    };
  }
}

export async function runOpenFootballSync(providers: BulkFootballDataProvider[]): Promise<OpenFootballSyncReport> {
  const startedAt = new Date();
  const season = computeCurrentFootballSeason();

  // The season row must exist (even with placeholder bounds) before any
  // competition can attach to it via syncOneCompetition — created/updated
  // here, then widened to real fixture-date bounds once we know them below.
  await db
    .insert(seasons)
    .values({ externalId: season.external, name: season.display, startDate: toDateString(new Date()), endDate: toDateString(new Date()), isActive: false })
    .onConflictDoUpdate({ target: seasons.externalId, set: { name: season.display, updatedAt: new Date() } });

  const competitionResults: CompetitionSyncResult[] = [];
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];
  let totalTeams = 0;
  let totalMatches = 0;
  const datasetsForSeasonBounds: NormalizedCompetitionDataset[] = [];

  for (const provider of providers) {
    for (const summary of provider.listCompetitions()) {
      const { result, dataset } = await syncOneCompetition(provider, summary, season.external);
      competitionResults.push(result);
      if (result.status === "SUCCESS" && dataset) {
        totalTeams += result.teamsUpserted;
        totalMatches += result.matchesUpserted;
        datasetsForSeasonBounds.push(dataset);
        globalWarnings.push(...dataset.warnings);
      } else if (result.error) {
        globalErrors.push(`${summary.name}: ${result.error}`);
      }
    }
  }

  const succeeded = competitionResults.filter((c) => c.status === "SUCCESS");
  const ok = succeeded.length > 0;

  if (ok) {
    // Widen the season's stored bounds using every successfully-fetched
    // competition's actual fixture dates, then activate it as the one
    // active season (deactivating whatever was active before).
    const allDates = datasetsForSeasonBounds.flatMap((d) => d.fixtures.map((f) => f.kickoffAt));
    const start = minDate(allDates);
    const end = maxDate(allDates);
    if (start && end) {
      await db
        .update(seasons)
        .set({ startDate: toDateString(start), endDate: toDateString(end), updatedAt: new Date() })
        .where(eq(seasons.externalId, season.external));
    }
    await db.update(seasons).set({ isActive: false }).where(eq(seasons.isActive, true));
    await db.update(seasons).set({ isActive: true }).where(eq(seasons.externalId, season.external));
  }

  await db.insert(syncLogs).values({
    jobName: "sync:fixtures",
    status: ok ? (globalErrors.length > 0 ? "PARTIAL" : "SUCCESS") : "FAILURE",
    itemsProcessed: totalMatches,
    message: ok ? (globalErrors.length ? `Partial: ${globalErrors.join(" | ")}` : null) : globalErrors.join(" | "),
    startedAt,
    finishedAt: new Date(),
  });

  return {
    sources: [...new Set(providers.map((p) => p.sourceName))],
    seasonExternalId: season.external,
    seasonDisplay: season.display,
    competitionsAttempted: competitionResults.length,
    competitionsSucceeded: succeeded.length,
    competitions: competitionResults,
    unsupportedCompetitions: UNSUPPORTED_COMPETITIONS,
    totalTeamsUpserted: totalTeams,
    totalMatchesUpserted: totalMatches,
    errors: globalErrors,
    warnings: globalWarnings,
    ok,
  };
}

function minDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}
function maxDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
