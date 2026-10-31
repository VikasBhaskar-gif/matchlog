import { db } from "../db/client.js";
import { matches, teams, players, matchEvents } from "../db/schema/index.js";
import { eq, inArray, and, or, sql } from "drizzle-orm";
import { VERIFIED_MATCHES } from "./verified-match-events.js";

export type MatchGoalEvent = {
  id: string;
  matchId: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string;
  type: "GOAL" | "OWN_GOAL" | "PENALTY_GOAL";
  minute: number;
  externalId: string | null;
};

/**
 * Retrieves match goal events from DB, or syncs official goalscorers from ESPN / verified matches.
 * NEVER generates synthetic/random goalscorers.
 */
export async function getOrGenerateMatchEvents(matchId: string): Promise<MatchGoalEvent[]> {
  // 1. Purge any legacy pseudo-generated events for this match
  await db
    .delete(matchEvents)
    .where(
      and(
        eq(matchEvents.matchId, matchId),
        sql`${matchEvents.externalId} LIKE 'gen:goal:%'`
      )
    )
    .catch(() => {});

  // 2. Query existing genuine match events
  let existing = await db
    .select({
      id: matchEvents.id,
      matchId: matchEvents.matchId,
      teamId: matchEvents.teamId,
      playerId: matchEvents.playerId,
      playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
      type: matchEvents.type,
      minute: matchEvents.minute,
      externalId: matchEvents.externalId,
    })
    .from(matchEvents)
    .leftJoin(players, eq(players.id, matchEvents.playerId))
    .where(
      and(
        eq(matchEvents.matchId, matchId),
        sql`(${matchEvents.externalId} IS NULL OR ${matchEvents.externalId} NOT LIKE 'gen:goal:%')`
      )
    )
    .orderBy(matchEvents.minute);

  // If no official events present, attempt ESPN real goal sync
  if (existing.length === 0) {
    const { syncEspnGoalsForMatch } = await import("./espn-goal-sync.service.js");
    const espnSynced = await syncEspnGoalsForMatch(matchId).catch(() => false);
    if (espnSynced) {
      existing = await db
        .select({
          id: matchEvents.id,
          matchId: matchEvents.matchId,
          teamId: matchEvents.teamId,
          playerId: matchEvents.playerId,
          playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
          type: matchEvents.type,
          minute: matchEvents.minute,
          externalId: matchEvents.externalId,
        })
        .from(matchEvents)
        .leftJoin(players, eq(players.id, matchEvents.playerId))
        .where(
          and(
            eq(matchEvents.matchId, matchId),
            sql`(${matchEvents.externalId} IS NULL OR ${matchEvents.externalId} NOT LIKE 'gen:goal:%')`
          )
        )
        .orderBy(matchEvents.minute);
    }
  }

  if (existing.length > 0) {
    return existing.filter(
      (e): e is MatchGoalEvent =>
        e.type === "GOAL" || e.type === "OWN_GOAL" || e.type === "PENALTY_GOAL"
    );
  }

  // 3. Fallback: Check verified matches dataset
  const verified = VERIFIED_MATCHES.find((v) => v.matchId === matchId);
  if (verified) {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });

    if (match) {
      const verifiedEvents = [];
      for (let i = 0; i < verified.goals.length; i++) {
        const g = verified.goals[i];
        const teamId = g.isHomeTeam ? match.homeTeamId : match.awayTeamId;

        let player = await db.query.players.findFirst({
          where: (p, { ilike }) => ilike(p.name, g.playerName),
        });

        if (!player) {
          const normName = g.playerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          player = await db.query.players.findFirst({
            where: (p, { ilike }) => ilike(p.name, normName),
          });
        }

        if (!player) {
          const slug = g.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const extId = `verified:player:${slug}`;
          const [inserted] = await db
            .insert(players)
            .values({
              externalId: extId,
              name: g.playerName,
              position: g.position ?? "Attack",
              nationality: g.nationality ?? null,
              currentTeamId: teamId,
              source: "FOOTBALL_DATA_ORG",
              updatedAt: new Date(),
            })
            .returning();
          player = inserted;
        }

        verifiedEvents.push({
          matchId,
          teamId: teamId,
          playerId: player.id,
          type: g.type ?? "GOAL",
          minute: g.minute,
          externalId: `verified:goal:${matchId}:${g.minute}:${i}`,
        });
      }

      if (verifiedEvents.length > 0) {
        await db.insert(matchEvents).values(verifiedEvents).onConflictDoNothing();
      }

      return db
        .select({
          id: matchEvents.id,
          matchId: matchEvents.matchId,
          teamId: matchEvents.teamId,
          playerId: matchEvents.playerId,
          playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
          type: matchEvents.type,
          minute: matchEvents.minute,
          externalId: matchEvents.externalId,
        })
        .from(matchEvents)
        .leftJoin(players, eq(players.id, matchEvents.playerId))
        .where(eq(matchEvents.matchId, matchId))
        .orderBy(matchEvents.minute) as Promise<MatchGoalEvent[]>;
    }
  }

  // Never invent fake goalscorers. Return empty list if official data is pending.
  return [];
}

/**
 * Sync official goal events for all finished matches that have scores.
 */
export async function backfillAllFinishedMatchEvents(): Promise<{
  matchesProcessed: number;
  eventsCreated: number;
}> {
  const finMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.status, "FINISHED"),
        or(sql`${matches.homeScore} > 0`, sql`${matches.awayScore} > 0`)
      )
    );

  let matchesProcessed = 0;
  let eventsCreated = 0;

  for (const m of finMatches) {
    const events = await getOrGenerateMatchEvents(m.id);
    if (events.length > 0) {
      matchesProcessed++;
      eventsCreated += events.length;
    }
  }

  return { matchesProcessed, eventsCreated };
}
