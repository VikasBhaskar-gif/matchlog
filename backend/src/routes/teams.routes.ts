import type { FastifyInstance } from "fastify";
import { and, eq, or, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { teams, followedTeams, players, followedPlayers, matchPlayers } from "../db/schema/index.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function teamRoutes(app: FastifyInstance) {
  app.get("/api/teams", async (request) => {
    const q = (request.query as any)?.q as string | undefined;
    const competitionId = (request.query as any)?.competitionId as string | undefined;
    const notDemo = sql`${teams.source} != 'DEMO'`;

    if (competitionId) {
      const isUuid = UUID_REGEX.test(competitionId);
      const compCondition = isUuid
        ? sql`m.competition_id = ${competitionId}`
        : sql`c.external_id = ${competitionId} OR c.name ILIKE ${"%" + competitionId + "%"}`;

      const querySql = sql`
        SELECT DISTINCT t.id, t.name, t.short_name as "shortName", t.logo_url as "logoUrl", t.country
        FROM teams t
        JOIN matches m ON (m.home_team_id = t.id OR m.away_team_id = t.id)
        JOIN competitions c ON m.competition_id = c.id
        WHERE ${compCondition}
        AND t.source != 'DEMO'
        ${q ? sql`AND t.name ILIKE ${"%" + q + "%"}` : sql``}
        ORDER BY t.name
      `;
      const rows = await db.execute(querySql);
      return { teams: rows as any[] };
    }

    const all = q
      ? await db.select().from(teams).where(and(sql`${teams.name} ilike ${"%" + q + "%"}`, notDemo)).orderBy(teams.name).limit(50)
      : await db.select().from(teams).where(notDemo).orderBy(teams.name);
    return { teams: all };
  });

  app.get<{ Params: { id: string } }>("/api/teams/:id", async (request, reply) => {
    const isUuid = UUID_REGEX.test(request.params.id);
    const team = isUuid
      ? await db.query.teams.findFirst({ where: eq(teams.id, request.params.id) })
      : await db.query.teams.findFirst({ where: eq(teams.externalId, request.params.id) });
    if (!team) {
      reply.code(404).send({ error: "Team not found." });
      return;
    }
    let isFollowing = false;
    let followedPlayerIds = new Set<string>();
    if (request.currentUser) {
      const follow = await db.query.followedTeams.findFirst({
        where: and(eq(followedTeams.userId, request.currentUser.id), eq(followedTeams.teamId, team.id)),
      });
      isFollowing = !!follow;

      const fRows = await db
        .select({ playerId: followedPlayers.playerId })
        .from(followedPlayers)
        .where(eq(followedPlayers.userId, request.currentUser.id));
      followedPlayerIds = new Set(fRows.map((f) => f.playerId));
    }

    // Query squad players: either currentTeamId matches OR they appeared in match_players for this team
    const squadRows = await db
      .select({
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
        position: players.position,
        nationality: players.nationality,
      })
      .from(players)
      .where(
        or(
          eq(players.currentTeamId, team.id),
          inArray(
            players.id,
            db
              .select({ playerId: matchPlayers.playerId })
              .from(matchPlayers)
              .where(eq(matchPlayers.teamId, team.id))
          )
        )
      )
      .orderBy(players.name);

    function getPositionPriority(pos?: string | null): number {
      if (!pos) return 4;
      const p = pos.toLowerCase();
      if (p.includes("goal") || p === "gk") return 1;
      if (p.includes("def") || p.includes("back")) return 2;
      if (p.includes("mid")) return 3;
      if (p.includes("att") || p.includes("forw") || p.includes("strik")) return 4;
      return 5;
    }

    const seen = new Set<string>();
    const squad = [];
    for (const p of squadRows) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      squad.push({
        ...p,
        isFollowing: followedPlayerIds.has(p.id),
      });
    }

    squad.sort((a, b) => {
      const pA = getPositionPriority(a.position);
      const pB = getPositionPriority(b.position);
      if (pA !== pB) return pA - pB;
      return a.name.localeCompare(b.name);
    });

    return { team: { ...team, isFollowing, squad } };
  });

  app.post<{ Params: { id: string } }>(
    "/api/teams/:id/follow",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const isUuid = UUID_REGEX.test(request.params.id);
      const team = isUuid
        ? await db.query.teams.findFirst({ where: eq(teams.id, request.params.id) })
        : await db.query.teams.findFirst({ where: eq(teams.externalId, request.params.id) });
      if (!team) {
        reply.code(404).send({ error: "Team not found." });
        return;
      }
      await db
        .insert(followedTeams)
        .values({ userId: request.currentUser!.id, teamId: team.id })
        .onConflictDoNothing();
      reply.code(201).send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/teams/:id/follow",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const isUuid = UUID_REGEX.test(request.params.id);
      const team = isUuid
        ? await db.query.teams.findFirst({ where: eq(teams.id, request.params.id) })
        : await db.query.teams.findFirst({ where: eq(teams.externalId, request.params.id) });
      if (team) {
        await db
          .delete(followedTeams)
          .where(
            and(eq(followedTeams.userId, request.currentUser!.id), eq(followedTeams.teamId, team.id))
          );
      }
      reply.send({ ok: true });
    }
  );
}
