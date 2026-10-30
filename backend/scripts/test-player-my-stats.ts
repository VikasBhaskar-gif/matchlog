import { db } from "../src/db/client.js";
import { watchedMatches, matchPlayers, matchEvents, players, users } from "../src/db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";

async function computePlayerStats(userId: string, playerId: string) {
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
    return { matchesWatchedWith: 0, minutesWatchedWith: 0 };
  }

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

  for (const watch of userWatches) {
    const mp = mpRows.find((r) => r.matchId === watch.matchId);
    const hasEvent = eventMatchIds.has(watch.matchId);

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

    if (overlap > 0 || didPlay) {
      matchesWatchedWith++;
      minutesWatchedWith += (overlap > 0 ? overlap : (mp?.minutesPlayed ?? watch.watchDuration));
    }
  }

  return { matchesWatchedWith, minutesWatchedWith };
}

async function main() {
  const user = await db.query.users.findFirst();
  if (!user) return;

  const pedri = await db.query.players.findFirst({ where: eq(players.id, "23e97421-7c63-473a-b802-3f68f188497b") });
  const fdj = await db.query.players.findFirst({ where: eq(players.name, "Frenkie de Jong") });
  const yamal = await db.query.players.findFirst({ where: eq(players.name, "Lamine Yamal") });
  const jesus = await db.query.players.findFirst({ where: eq(players.name, "Gabriel Jesus") });
  const mbappe = await db.query.players.findFirst({ where: eq(players.name, "Kylian Mbappé") });

  console.log("Pedri:", await computePlayerStats(user.id, pedri!.id));
  console.log("Frenkie de Jong:", await computePlayerStats(user.id, fdj!.id));
  console.log("Lamine Yamal:", await computePlayerStats(user.id, yamal!.id));
  console.log("Gabriel Jesus:", await computePlayerStats(user.id, jesus!.id));
  console.log("Kylian Mbappé:", await computePlayerStats(user.id, mbappe!.id));
}

main().catch(console.error).finally(() => process.exit(0));
