import type { FastifyInstance } from "fastify";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  followedTeams,
  followedCompetitions,
  followedPlayers,
  teams,
  competitions,
  players,
  watchedMatches,
  matches,
  matchPlayers,
  matchEvents,
} from "../db/schema/index.js";

export default async function meRoutes(app: FastifyInstance) {
  app.get("/api/me/follows", { preHandler: app.requireAuth }, async (request) => {
    const userId = request.currentUser!.id;

    const [followedTeamRows, followedCompRows, followedPlayerRows, userWatches] = await Promise.all([
      db
        .select({ team: teams })
        .from(followedTeams)
        .innerJoin(teams, eq(teams.id, followedTeams.teamId))
        .where(eq(followedTeams.userId, userId)),
      db
        .select({ competition: competitions })
        .from(followedCompetitions)
        .innerJoin(competitions, eq(competitions.id, followedCompetitions.competitionId))
        .where(eq(followedCompetitions.userId, userId)),
      db
        .select({
          player: {
            id: players.id,
            externalId: players.externalId,
            name: players.name,
            photoUrl: players.photoUrl,
            position: players.position,
            nationality: players.nationality,
            currentTeamId: players.currentTeamId,
            teamName: teams.name,
            teamBadgeUrl: teams.logoUrl,
          },
        })
        .from(followedPlayers)
        .innerJoin(players, eq(players.id, followedPlayers.playerId))
        .leftJoin(teams, eq(teams.id, players.currentTeamId))
        .where(eq(followedPlayers.userId, userId)),
      db
        .select({
          matchId: watchedMatches.matchId,
          watchDuration: watchedMatches.watchDurationMinutes,
          startMinute: watchedMatches.startMinute,
          endMinute: watchedMatches.endMinute,
          homeTeamId: matches.homeTeamId,
          awayTeamId: matches.awayTeamId,
        })
        .from(watchedMatches)
        .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
        .where(eq(watchedMatches.userId, userId)),
    ]);

    // 1. Sort Followed Teams by matches/minutes watched
    const teamWatchStats = new Map<string, { matches: number; minutes: number }>();
    for (const w of userWatches) {
      if (w.homeTeamId) {
        const curr = teamWatchStats.get(w.homeTeamId) ?? { matches: 0, minutes: 0 };
        curr.matches += 1;
        curr.minutes += w.watchDuration;
        teamWatchStats.set(w.homeTeamId, curr);
      }
      if (w.awayTeamId) {
        const curr = teamWatchStats.get(w.awayTeamId) ?? { matches: 0, minutes: 0 };
        curr.matches += 1;
        curr.minutes += w.watchDuration;
        teamWatchStats.set(w.awayTeamId, curr);
      }
    }

    const sortedTeams = followedTeamRows
      .map((r) => r.team)
      .sort((a, b) => {
        const statA = teamWatchStats.get(a.id) ?? { matches: 0, minutes: 0 };
        const statB = teamWatchStats.get(b.id) ?? { matches: 0, minutes: 0 };
        if (statB.matches !== statA.matches) return statB.matches - statA.matches;
        if (statB.minutes !== statA.minutes) return statB.minutes - statA.minutes;
        return a.name.localeCompare(b.name);
      });

    // 2. Sort Followed Players by minutes watched
    const followedPlayerIds = followedPlayerRows.map((r) => r.player.id);
    const watchedMatchIds = userWatches.map((w) => w.matchId);
    const playerMinutesMap = new Map<string, number>();

    if (followedPlayerIds.length > 0 && watchedMatchIds.length > 0) {
      const [mpRows, meRows] = await Promise.all([
        db
          .select({
            playerId: matchPlayers.playerId,
            matchId: matchPlayers.matchId,
            isStarter: matchPlayers.isStarter,
            minutesPlayed: matchPlayers.minutesPlayed,
            subInMinute: matchPlayers.subInMinute,
          })
          .from(matchPlayers)
          .where(
            and(
              inArray(matchPlayers.playerId, followedPlayerIds),
              inArray(matchPlayers.matchId, watchedMatchIds)
            )
          ),
        db
          .select({
            playerId: matchEvents.playerId,
            matchId: matchEvents.matchId,
          })
          .from(matchEvents)
          .where(
            and(
              isNotNull(matchEvents.playerId),
              inArray(matchEvents.playerId, followedPlayerIds),
              inArray(matchEvents.matchId, watchedMatchIds)
            )
          ),
      ]);

      const eventMatchSet = new Set(meRows.map((e) => `${e.playerId}:${e.matchId}`));

      for (const watch of userWatches) {
        for (const pId of followedPlayerIds) {
          const mp = mpRows.find((r) => r.playerId === pId && r.matchId === watch.matchId);
          const hasEvent = eventMatchSet.has(`${pId}:${watch.matchId}`);

          if (!mp && !hasEvent) continue;

          const didPlay =
            mp?.isStarter === true ||
            (mp?.minutesPlayed !== null && (mp?.minutesPlayed ?? 0) > 0) ||
            mp?.subInMinute !== null ||
            hasEvent;

          if (!didPlay) continue;

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

          playerMinutesMap.set(pId, (playerMinutesMap.get(pId) ?? 0) + actualMin);
        }
      }
    }

    const sortedPlayers = followedPlayerRows
      .map((r) => r.player)
      .sort((a, b) => {
        const minA = playerMinutesMap.get(a.id) ?? 0;
        const minB = playerMinutesMap.get(b.id) ?? 0;
        if (minB !== minA) return minB - minA;
        return a.name.localeCompare(b.name);
      });

    return {
      teams: sortedTeams,
      competitions: followedCompRows.map((r) => r.competition),
      players: sortedPlayers,
    };
  });
}
