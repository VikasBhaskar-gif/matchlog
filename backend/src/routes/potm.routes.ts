import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, inArray, or, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  playerOfMatchVotes,
  watchedMatches,
  matches,
  matchPlayers,
  matchEvents,
  players,
  teams,
  competitions,
} from "../db/schema/index.js";
import { parseOrThrow } from "../lib/validate.js";
import { syncEspnLineupForMatch } from "../football/espn-lineup-sync.service.js";

const potmSchema = z.object({ playerId: z.string().uuid() });

function normalizePosition(pos: string | null | undefined): string | null {
  if (!pos) return null;
  if (pos.toLowerCase() === "offence") return "Attack";
  return pos;
}

export default async function potmRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/potm",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const body = parseOrThrow(potmSchema, request.body);
      const userId = request.currentUser!.id;
      const matchId = request.params.id;

      const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
      if (!match) {
        reply.code(404).send({ error: "Match not found." });
        return;
      }

      if (match.status !== "FINISHED") {
        reply.code(400).send({ error: "Man of the Match voting is only available once the match is completed." });
        return;
      }

      const watched = await db.query.watchedMatches.findFirst({
        where: and(eq(watchedMatches.userId, userId), eq(watchedMatches.matchId, matchId)),
      });
      if (!watched) {
        reply.code(403).send({ error: "Record that you watched this match before voting for Man of the Match." });
        return;
      }

      // Check player existence
      const player = await db.query.players.findFirst({ where: eq(players.id, body.playerId) });
      if (!player) {
        reply.code(404).send({ error: "Player not found." });
        return;
      }

      // Check if this match has verified lineup data
      let matchHasLineup = await db.query.matchPlayers.findFirst({
        where: eq(matchPlayers.matchId, matchId),
      });

      // If no lineup rows exist yet, try on-demand ESPN sync
      if (!matchHasLineup && match.status === "FINISHED") {
        try {
          await syncEspnLineupForMatch(matchId);
          matchHasLineup = await db.query.matchPlayers.findFirst({
            where: eq(matchPlayers.matchId, matchId),
          });
        } catch (e) {
          // ignore sync failure
        }
      }

      if (matchHasLineup) {
        // Lineup data is present: ONLY players who actually played (starter or subbed in) are eligible
        const inMatchPlayers = await db.query.matchPlayers.findFirst({
          where: and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, body.playerId)),
        });

        const inEvents = await db.query.matchEvents.findFirst({
          where: and(eq(matchEvents.matchId, matchId), eq(matchEvents.playerId, body.playerId)),
        });

        const didPlay =
          (inMatchPlayers && (inMatchPlayers.isStarter || (inMatchPlayers.minutesPlayed !== null && inMatchPlayers.minutesPlayed > 0))) ||
          !!inEvents;

        if (!didPlay) {
          reply.code(400).send({
            error: "Only players who played in the game as a starter or substitute are eligible for Man of the Match.",
          });
          return;
        }
      } else {
        // Fallback for matches without lineup data: check events or team membership
        const inEvents = await db.query.matchEvents.findFirst({
          where: and(eq(matchEvents.matchId, matchId), eq(matchEvents.playerId, body.playerId)),
        });

        const inTeam =
          (match.homeTeamId && player.currentTeamId === match.homeTeamId) ||
          (match.awayTeamId && player.currentTeamId === match.awayTeamId);

        if (!inEvents && !inTeam) {
          reply.code(400).send({ error: "That player did not participate in this match." });
          return;
        }
      }

      const existing = await db.query.playerOfMatchVotes.findFirst({
        where: and(eq(playerOfMatchVotes.userId, userId), eq(playerOfMatchVotes.matchId, matchId)),
      });

      let vote;
      if (existing) {
        [vote] = await db
          .update(playerOfMatchVotes)
          .set({ playerId: body.playerId, updatedAt: new Date() })
          .where(eq(playerOfMatchVotes.id, existing.id))
          .returning();
      } else {
        [vote] = await db
          .insert(playerOfMatchVotes)
          .values({ userId, matchId, playerId: body.playerId })
          .returning();
      }

      reply.code(201).send({ vote });
    }
  );

  app.get<{ Params: { id: string } }>("/api/matches/:id/potm", async (request) => {
    const matchId = request.params.id;
    const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });

    const votes = await db
      .select({
        playerId: playerOfMatchVotes.playerId,
        name: players.name,
        position: players.position,
        currentTeamId: players.currentTeamId,
        userId: playerOfMatchVotes.userId,
        createdAt: playerOfMatchVotes.createdAt,
      })
      .from(playerOfMatchVotes)
      .innerJoin(players, eq(players.id, playerOfMatchVotes.playerId))
      .where(eq(playerOfMatchVotes.matchId, matchId));

    const tally = new Map<
      string,
      {
        name: string;
        position: string | null;
        votes: number;
        earliestVote: Date;
      }
    >();

    for (const v of votes) {
      const entry = tally.get(v.playerId) ?? {
        name: v.name,
        position: normalizePosition(v.position),
        votes: 0,
        earliestVote: v.createdAt,
      };
      entry.votes += 1;
      if (v.createdAt < entry.earliestVote) {
        entry.earliestVote = v.createdAt;
      }
      tally.set(v.playerId, entry);
    }

    const totalVotes = votes.length;
    const sorted = [...tally.entries()]
      .map(([playerId, v]) => ({
        playerId,
        name: v.name,
        position: normalizePosition(v.position),
        votes: v.votes,
        percentage: totalVotes > 0 ? Math.round((v.votes / totalVotes) * 100) : 0,
        earliestVote: v.earliestVote,
      }))
      .sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        if (a.earliestVote.getTime() !== b.earliestVote.getTime()) {
          return a.earliestVote.getTime() - b.earliestVote.getTime();
        }
        return a.playerId.localeCompare(b.playerId);
      });

    const topThree = sorted.slice(0, 3).map((item, idx) => ({
      rank: idx + 1,
      playerId: item.playerId,
      name: item.name,
      position: item.position,
      votes: item.votes,
      percentage: item.percentage,
    }));

    const peoplesMotm = sorted.length > 0 ? topThree[0] : null;

    let myVote: string | null = null;
    if (request.currentUser?.id) {
      const existing = await db.query.playerOfMatchVotes.findFirst({
        where: and(
          eq(playerOfMatchVotes.userId, request.currentUser.id),
          eq(playerOfMatchVotes.matchId, matchId)
        ),
      });
      if (existing) myVote = existing.playerId;
    }

    const teamIds = [match?.homeTeamId, match?.awayTeamId].filter(Boolean) as string[];

    /**
     * Determine candidate players for POTM voting.
     *
     * Priority:
     * 1. match_players table — verified starters and substitutes who appeared
     *    (isStarter=true OR minutesPlayed > 0 OR any match event references them)
     * 2. Substitutes detected via SUBSTITUTION events (player_id = the sub coming on)
     * 3. Fallback: current squad members — used when no lineup data is available
     *
     * Data availability note:
     * - The OpenFootball provider (source='OPENFOOTBALL') does not sync lineup data.
     *   match_players is empty for all matches. The Football-Data.org provider
     *   (source='FOOTBALL_DATA_ORG') may populate match_players if the sync job runs.
     * - When no lineup data is available, the full current squad is shown with a
     *   'No lineup data' flag so the UI can display an appropriate notice.
     */
    type CandidatePlayer = {
      id: string;
      name: string;
      photoUrl: string | null;
      position: string | null;
      tacticalPosition: string | null;
      formationPlace: number | null;
      currentTeamId: string | null;
      teamId: string | null;
      isStarter: boolean | null;
      minutesPlayed: number | null;
      subInMinute: number | null;
    };

    let hasLineupData = false;
    let homeCandidates: CandidatePlayer[] = [];
    let awayCandidates: CandidatePlayer[] = [];

    if (teamIds.length > 0) {
      // If match is finished and no match_players exist (or lack tactical positions), try on-demand ESPN sync
      if (match?.status === "FINISHED") {
        const existingStats = await db
          .select({
            count: sql<number>`count(*)`,
            hasTactical: sql<number>`count(tactical_position)`,
          })
          .from(matchPlayers)
          .where(eq(matchPlayers.matchId, matchId));

        const total = Number(existingStats[0]?.count ?? 0);
        const withTactical = Number(existingStats[0]?.hasTactical ?? 0);

        if (total === 0 || withTactical === 0) {
          try {
            await syncEspnLineupForMatch(matchId);
          } catch (e) {
            // on-demand sync failure is non-fatal
          }
        }
      }

      // Check if we have match_players data for this match
      const matchPlayerRows = await db
        .select({
          id: players.id,
          name: players.name,
          photoUrl: players.photoUrl,
          position: players.position,
          tacticalPosition: matchPlayers.tacticalPosition,
          formationPlace: matchPlayers.formationPlace,
          currentTeamId: players.currentTeamId,
          teamId: matchPlayers.teamId,
          isStarter: matchPlayers.isStarter,
          minutesPlayed: matchPlayers.minutesPlayed,
          subInMinute: matchPlayers.subInMinute,
        })
        .from(matchPlayers)
        .innerJoin(players, eq(players.id, matchPlayers.playerId))
        .where(eq(matchPlayers.matchId, matchId));

      // Also check for players who appeared in match events (goals, substitutions, cards)
      // to catch players not in match_players but confirmed as participants
      const eventPlayerIds = await db
        .select({ playerId: matchEvents.playerId })
        .from(matchEvents)
        .where(
          and(
            eq(matchEvents.matchId, matchId),
          )
        );
      const eventPlayerIdSet = new Set(
        eventPlayerIds.map((e) => e.playerId).filter(Boolean) as string[]
      );

      if (matchPlayerRows.length > 0) {
        hasLineupData = true;
        // Only include starters or players who actually entered the pitch as substitutes (minutesPlayed > 0)
        // or appeared in official match events
        const appeared = matchPlayerRows.filter(
          (mp) => mp.isStarter || (mp.minutesPlayed !== null && mp.minutesPlayed > 0) || eventPlayerIdSet.has(mp.id)
        );

        homeCandidates = appeared
          .filter((p) => p.teamId === match?.homeTeamId)
          .map((p) => ({ ...p, position: normalizePosition(p.position) }));
        awayCandidates = appeared
          .filter((p) => p.teamId === match?.awayTeamId)
          .map((p) => ({ ...p, position: normalizePosition(p.position) }));
      } else if (eventPlayerIdSet.size > 0) {
        // Only confirmed participants from match events (never dump unverified full squad)
        hasLineupData = false;
        const confirmedEventPlayers = await db
          .select({
            id: players.id,
            name: players.name,
            photoUrl: players.photoUrl,
            position: players.position,
            currentTeamId: players.currentTeamId,
          })
          .from(players)
          .where(inArray(players.id, Array.from(eventPlayerIdSet)));

        const asCandidate = (p: typeof confirmedEventPlayers[0], teamId: string): CandidatePlayer => ({
          ...p,
          position: normalizePosition(p.position),
          tacticalPosition: null,
          formationPlace: null,
          teamId,
          isStarter: null,
          minutesPlayed: null,
          subInMinute: null,
        });

        homeCandidates = confirmedEventPlayers
          .filter((p) => p.currentTeamId === match?.homeTeamId)
          .map((p) => asCandidate(p, match!.homeTeamId!))
          .sort((a, b) => a.name.localeCompare(b.name));
        awayCandidates = confirmedEventPlayers
          .filter((p) => p.currentTeamId === match?.awayTeamId)
          .map((p) => asCandidate(p, match!.awayTeamId!))
          .sort((a, b) => a.name.localeCompare(b.name));
      } else {
        hasLineupData = false;
        homeCandidates = [];
        awayCandidates = [];
      }
    }

    const currentMatch = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });

    return {
      communityPotm: sorted,
      topThree,
      peoplesMotm,
      totalVotes,
      myVote,
      hasLineupData,
      homeFormation: currentMatch?.homeFormation ?? null,
      awayFormation: currentMatch?.awayFormation ?? null,
      candidates: {
        home: homeCandidates,
        away: awayCandidates,
      },
    };
  });

  // POTM voting history with Match details and Overall community vote
  async function getPotmVotesForUser(userId: string) {
    // Fetch all votes cast by this user
    const userVotes = await db
      .select({
        id: playerOfMatchVotes.id,
        matchId: playerOfMatchVotes.matchId,
        playerId: playerOfMatchVotes.playerId,
        createdAt: playerOfMatchVotes.createdAt,
      })
      .from(playerOfMatchVotes)
      .where(eq(playerOfMatchVotes.userId, userId))
      .orderBy(desc(playerOfMatchVotes.createdAt));

    if (userVotes.length === 0) {
      return { votes: [] };
    }

    const matchIds = [...new Set(userVotes.map((v) => v.matchId))];

    // Fetch matches with teams and competitions
    const matchRows = await db
      .select({
        id: matches.id,
        competitionId: matches.competitionId,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        kickoffAt: matches.kickoffAt,
        status: matches.status,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        round: matches.round,
      })
      .from(matches)
      .where(inArray(matches.id, matchIds));

    // Fetch team info
    const teamIds = [
      ...new Set(
        matchRows
          .flatMap((m) => [m.homeTeamId, m.awayTeamId])
          .filter(Boolean) as string[]
      ),
    ];
    const compIds = [...new Set(matchRows.map((m) => m.competitionId).filter(Boolean) as string[])];

    const [teamRows, compRows] = await Promise.all([
      teamIds.length > 0 ? db.select().from(teams).where(inArray(teams.id, teamIds)) : [],
      compIds.length > 0 ? db.select().from(competitions).where(inArray(competitions.id, compIds)) : [],
    ]);
    const teamMap = new Map(teamRows.map((t) => [t.id, t]));
    const compMap = new Map(compRows.map((c) => [c.id, c]));
    const matchMap = new Map(
      matchRows.map((m) => [
        m.id,
        {
          ...m,
          homeTeam: m.homeTeamId ? teamMap.get(m.homeTeamId) ?? null : null,
          awayTeam: m.awayTeamId ? teamMap.get(m.awayTeamId) ?? null : null,
          competition: compMap.get(m.competitionId) ?? null,
        },
      ])
    );

    // Fetch all votes for these matches to calculate the overall community winner for each match
    const allMatchVotes = await db
      .select({
        matchId: playerOfMatchVotes.matchId,
        playerId: playerOfMatchVotes.playerId,
        createdAt: playerOfMatchVotes.createdAt,
      })
      .from(playerOfMatchVotes)
      .where(inArray(playerOfMatchVotes.matchId, matchIds));

    // Group votes by matchId
    const votesByMatch = new Map<string, { playerId: string; createdAt: Date }[]>();
    for (const v of allMatchVotes) {
      const arr = votesByMatch.get(v.matchId) ?? [];
      arr.push({ playerId: v.playerId, createdAt: v.createdAt });
      votesByMatch.set(v.matchId, arr);
    }

    // Determine overall winner for each match
    const overallWinnerPlayerIds = new Set<string>();
    const overallWinnerByMatch = new Map<
      string,
      {
        playerId: string;
        votes: number;
        totalVotes: number;
        percentage: number;
      }
    >();

    for (const [mId, mVotes] of votesByMatch.entries()) {
      const tally = new Map<string, { count: number; earliestVote: Date }>();
      for (const mv of mVotes) {
        const item = tally.get(mv.playerId) ?? { count: 0, earliestVote: mv.createdAt };
        item.count += 1;
        if (mv.createdAt < item.earliestVote) item.earliestVote = mv.createdAt;
        tally.set(mv.playerId, item);
      }
      const sorted = [...tally.entries()].sort((a, b) => {
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return a[1].earliestVote.getTime() - b[1].earliestVote.getTime();
      });
      if (sorted.length > 0) {
        const [topPlayerId, topData] = sorted[0];
        overallWinnerPlayerIds.add(topPlayerId);
        overallWinnerByMatch.set(mId, {
          playerId: topPlayerId,
          votes: topData.count,
          totalVotes: mVotes.length,
          percentage: Math.round((topData.count / mVotes.length) * 100),
        });
      }
    }

    // Collect all player IDs needed (user voted players + overall winners)
    const allPlayerIds = [
      ...new Set([
        ...userVotes.map((v) => v.playerId),
        ...overallWinnerPlayerIds,
      ]),
    ];

    const playerRows = await db
      .select({
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
        position: players.position,
        currentTeamId: players.currentTeamId,
      })
      .from(players)
      .where(inArray(players.id, allPlayerIds));

    // Also get team info for players' currentTeamId if needed
    const playerTeamIds = [...new Set(playerRows.map((p) => p.currentTeamId).filter(Boolean) as string[])];
    const missingTeamIds = playerTeamIds.filter((tId) => !teamMap.has(tId));
    if (missingTeamIds.length > 0) {
      const extraTeams = await db.select().from(teams).where(inArray(teams.id, missingTeamIds));
      for (const t of extraTeams) teamMap.set(t.id, t);
    }

    const playerMap = new Map(
      playerRows.map((p) => [
        p.id,
        {
          ...p,
          team: p.currentTeamId ? teamMap.get(p.currentTeamId) ?? null : null,
        },
      ])
    );

    const result = userVotes.map((uv) => {
      const match = matchMap.get(uv.matchId) ?? null;
      const myPlayer = playerMap.get(uv.playerId) ?? null;
      const overallData = overallWinnerByMatch.get(uv.matchId);
      const overallPlayer = overallData ? playerMap.get(overallData.playerId) ?? null : null;

      return {
        id: uv.id,
        votedAt: uv.createdAt,
        match,
        myVote: {
          player: myPlayer,
        },
        overallVote: overallData && overallPlayer
          ? {
              player: overallPlayer,
              votes: overallData.votes,
              totalVotes: overallData.totalVotes,
              percentage: overallData.percentage,
              isSameAsMyVote: overallData.playerId === uv.playerId,
            }
          : null,
      };
    });

    return { votes: result };
  }

  // Current user's complete POTM voting history with Match details and Overall community vote
  app.get("/api/me/potm-votes", { preHandler: app.requireAuth }, async (request) => {
    return getPotmVotesForUser(request.currentUser!.id);
  });

  // Any user's POTM voting history
  app.get<{ Params: { id: string } }>("/api/users/:id/potm-votes", { preHandler: app.requireAuth }, async (request) => {
    return getPotmVotesForUser(request.params.id);
  });
}
