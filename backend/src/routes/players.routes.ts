import type { FastifyInstance } from "fastify";
import { and, eq, sql, ilike, or, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  players,
  followedPlayers,
  matchPlayers,
  matchEvents,
  watchedMatches,
  playerOfMatchVotes,
  teams,
  matches,
  competitions,
} from "../db/schema/index.js";

export default async function playerRoutes(app: FastifyInstance) {
  app.get("/api/players", async (request) => {
    const q = (request.query as any)?.q as string | undefined;
    const notDemo = sql`${players.source} != 'DEMO'`;
    const searchCondition = q && q.trim() ? ilike(players.name, `%${q.trim()}%`) : undefined;
    const whereClause = searchCondition ? and(searchCondition, notDemo) : notDemo;

    const userId = request.currentUser?.id;
    let followedPlayerIds = new Set<string>();
    if (userId) {
      const fRows = await db
        .select({ playerId: followedPlayers.playerId })
        .from(followedPlayers)
        .where(eq(followedPlayers.userId, userId));
      followedPlayerIds = new Set(fRows.map((f) => f.playerId));
    }

    const rows = await db
      .select({
        id: players.id,
        externalId: players.externalId,
        name: players.name,
        photoUrl: players.photoUrl,
        position: players.position,
        nationality: players.nationality,
        currentTeamId: players.currentTeamId,
        teamName: teams.name,
        teamBadgeUrl: teams.logoUrl,
      })
      .from(players)
      .leftJoin(teams, eq(teams.id, players.currentTeamId))
      .where(whereClause)
      .orderBy(players.name)
      .limit(60);

    return {
      players: rows.map((r) => ({
        ...r,
        isFollowing: followedPlayerIds.has(r.id),
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/players/:id", async (request, reply) => {
    const player = await db.query.players.findFirst({ where: eq(players.id, request.params.id) });
    if (!player) {
      reply.code(404).send({ error: "Player not found." });
      return;
    }

    const team = player.currentTeamId
      ? await db.query.teams.findFirst({ where: eq(teams.id, player.currentTeamId) })
      : null;

    // Calculate People's MOTM awards using deterministic tie-breaker:
    // 1. most votes in match
    // 2. earliest vote timestamp (min created_at)
    // 3. player_id ascending
    const awardsResult = await db.execute(sql`
      WITH match_tallies AS (
        SELECT 
          match_id,
          player_id,
          count(*) as vote_count,
          min(created_at) as earliest_vote
        FROM player_of_match_votes
        GROUP BY match_id, player_id
      ),
      ranked_winners AS (
        SELECT 
          match_id,
          player_id,
          vote_count,
          ROW_NUMBER() OVER (
            PARTITION BY match_id 
            ORDER BY vote_count DESC, earliest_vote ASC, player_id ASC
          ) as rank
        FROM match_tallies
      )
      SELECT count(*)::int as count
      FROM ranked_winners
      WHERE rank = 1 AND player_id = ${player.id}
    `);

    const peoplesMotmAwards = Number((awardsResult as any)[0]?.count ?? 0);

    let isFollowing = false;
    if (request.currentUser?.id) {
      const follow = await db.query.followedPlayers.findFirst({
        where: and(
          eq(followedPlayers.userId, request.currentUser.id),
          eq(followedPlayers.playerId, player.id)
        ),
      });
      isFollowing = !!follow;
    }

    return {
      player: {
        ...player,
        team,
        peoplesMotmAwards,
        isFollowing,
      },
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/players/:id/follow",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const player = await db.query.players.findFirst({ where: eq(players.id, request.params.id) });
      if (!player) {
        reply.code(404).send({ error: "Player not found." });
        return;
      }
      await db
        .insert(followedPlayers)
        .values({ userId: request.currentUser!.id, playerId: player.id })
        .onConflictDoNothing();
      reply.code(201).send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/players/:id/follow",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      await db
        .delete(followedPlayers)
        .where(
          and(eq(followedPlayers.userId, request.currentUser!.id), eq(followedPlayers.playerId, request.params.id))
        );
      reply.send({ ok: true });
    }
  );

  // "How much football involving this player did THIS USER watch?"
  app.get<{ Params: { id: string } }>(
    "/api/players/:id/my-stats",
    { preHandler: app.requireAuth },
    async (request) => {
      const userId = request.currentUser!.id;
      const playerId = request.params.id;

      const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
      if (!player) {
        return {
          matchesWatchedWith: 0,
          minutesWatchedWith: 0,
          timesSelectedAsPotm: 0,
        };
      }

      // 1. Get all matches watched by this user
      const userWatches = await db
        .select({
          matchId: watchedMatches.matchId,
          startMinute: watchedMatches.startMinute,
          endMinute: watchedMatches.endMinute,
          watchDuration: watchedMatches.watchDurationMinutes,
        })
        .from(watchedMatches)
        .where(eq(watchedMatches.userId, userId));

      const watchedMatchIds = userWatches.map((w) => w.matchId);
      if (watchedMatchIds.length === 0) {
        return {
          matchesWatchedWith: 0,
          minutesWatchedWith: 0,
          timesSelectedAsPotm: 0,
        };
      }

      // 2. Matches where player is in match_players (verified starters and appearing subs)
      const mpRows = await db
        .select({
          matchId: matchPlayers.matchId,
          isStarter: matchPlayers.isStarter,
          minutesPlayed: matchPlayers.minutesPlayed,
          subInMinute: matchPlayers.subInMinute,
        })
        .from(matchPlayers)
        .where(
          and(
            eq(matchPlayers.playerId, playerId),
            inArray(matchPlayers.matchId, watchedMatchIds)
          )
        );

      // 3. Matches where player appeared in matchEvents (e.g. scored a goal or card)
      const meRows = await db
        .select({
          matchId: matchEvents.matchId,
          minute: matchEvents.minute,
        })
        .from(matchEvents)
        .where(
          and(
            eq(matchEvents.playerId, playerId),
            inArray(matchEvents.matchId, watchedMatchIds)
          )
        );

      const eventMatchIds = new Set(meRows.map((e) => e.matchId));

      let matchesWatchedWith = 0;
      let minutesWatchedWith = 0;

      const playedMatchItems: {
        matchId: string;
        minutesWatched: number;
        isStarter: boolean;
        minutesPlayed: number | null;
        subInMinute: number | null;
      }[] = [];

      for (const watch of userWatches) {
        const mp = mpRows.find((r) => r.matchId === watch.matchId);
        const hasEvent = eventMatchIds.has(watch.matchId);

        // Player must have actually played in this match (verified starter, subbed on, or event participant)
        if (!mp && !hasEvent) {
          continue;
        }

        const didPlay =
          mp?.isStarter === true ||
          (mp?.minutesPlayed !== null && (mp?.minutesPlayed ?? 0) > 0) ||
          mp?.subInMinute !== null ||
          hasEvent;

        if (!didPlay) {
          continue;
        }

        // Determine player on-pitch interval [playerStart, playerEnd]
        let playerStart = 0;
        let playerEnd = 90;

        if (mp) {
          if (mp.isStarter) {
            playerStart = 0;
            playerEnd = mp.minutesPlayed ? Math.min(120, mp.minutesPlayed) : 90;
          } else {
            playerStart = mp.subInMinute ?? (mp.minutesPlayed ? Math.max(1, 90 - mp.minutesPlayed) : 70);
            playerEnd = Math.min(120, playerStart + (mp.minutesPlayed || (90 - playerStart)));
          }
        }

        const userStart = watch.startMinute ?? 0;
        const userEnd = watch.endMinute ?? (userStart + watch.watchDuration);

        const overlap = Math.max(0, Math.min(userEnd, playerEnd) - Math.max(userStart, playerStart));
        const actualMin = overlap > 0 ? overlap : (mp?.minutesPlayed ?? watch.watchDuration);

        matchesWatchedWith++;
        minutesWatchedWith += actualMin;

        playedMatchItems.push({
          matchId: watch.matchId,
          minutesWatched: actualMin,
          isStarter: mp?.isStarter ?? (hasEvent ? true : false),
          minutesPlayed: mp?.minutesPlayed ?? null,
          subInMinute: mp?.subInMinute ?? null,
        });
      }

      // Count actual POTM selections made by the current user for matches watched
      const [potmCount] = await db
        .select({ count: sql<number>`count(distinct ${playerOfMatchVotes.matchId})` })
        .from(playerOfMatchVotes)
        .innerJoin(
          watchedMatches,
          and(eq(watchedMatches.matchId, playerOfMatchVotes.matchId), eq(watchedMatches.userId, userId))
        )
        .where(and(eq(playerOfMatchVotes.userId, userId), eq(playerOfMatchVotes.playerId, playerId)));

      // Fetch match and team details for the watched matches featuring this player
      let watchedMatchesList: any[] = [];
      if (playedMatchItems.length > 0) {
        const playedMatchIds = playedMatchItems.map((item) => item.matchId);
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
          .where(inArray(matches.id, playedMatchIds));

        const teamIds = [
          ...new Set(matchRows.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean) as string[]),
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

        watchedMatchesList = playedMatchItems
          .map((item) => {
            const match = matchMap.get(item.matchId);
            if (!match) return null;
            return {
              ...match,
              minutesWatched: item.minutesWatched,
              isStarter: item.isStarter,
              minutesPlayed: item.minutesPlayed,
              subInMinute: item.subInMinute,
            };
          })
          .filter(Boolean)
          .sort((a, b) => new Date(b!.kickoffAt).getTime() - new Date(a!.kickoffAt).getTime());
      }

      return {
        matchesWatchedWith,
        minutesWatchedWith,
        timesSelectedAsPotm: Number(potmCount?.count ?? 0),
        matches: watchedMatchesList,
      };
    }
  );
}
