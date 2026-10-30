import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, teams, watchedMatches } from "../db/schema/index.js";
import { parseOrThrow } from "../lib/validate.js";
import { sql, inArray } from "drizzle-orm";
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  searchUsers,
  getFriendActivityFeed,
  areFriends,
  followUser,
  unfollowUser,
  getFollowStatus,
  FriendError,
} from "../services/friends.service.js";

function publicUserSummary(u: { id: string; username: string; avatar: string | null }) {
  return { id: u.id, username: u.username, avatar: u.avatar };
}

export default async function friendsRoutes(app: FastifyInstance) {
  app.get("/api/users/search", { preHandler: app.requireAuth }, async (request) => {
    const q = ((request.query as any)?.q as string | undefined)?.trim();
    if (!q || q.length < 2) return { users: [] };
    const results = await searchUsers(q, request.currentUser!.id);
    return { users: results.map(publicUserSummary) };
  });

  const sendSchema = z.object({ receiverId: z.string().uuid() });
  app.post("/api/friends/requests", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseOrThrow(sendSchema, request.body);
    try {
      const result = await sendFriendRequest(request.currentUser!.id, body.receiverId);
      reply.code(201).send({ request: result });
    } catch (err) {
      if (err instanceof FriendError) {
        reply.code(err.statusCode).send({ error: err.message });
        return;
      }
      throw err;
    }
  });

  app.get("/api/friends/requests/incoming", { preHandler: app.requireAuth }, async (request) => {
    const rows = await listIncomingRequests(request.currentUser!.id);
    return { requests: rows.map((r) => ({ id: r.request.id, createdAt: r.request.createdAt, sender: publicUserSummary(r.sender) })) };
  });

  app.get("/api/friends/requests/outgoing", { preHandler: app.requireAuth }, async (request) => {
    const rows = await listOutgoingRequests(request.currentUser!.id);
    return {
      requests: rows.map((r) => ({ id: r.request.id, createdAt: r.request.createdAt, receiver: publicUserSummary(r.receiver) })),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/friends/requests/:id/accept",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      try {
        await acceptFriendRequest(request.currentUser!.id, request.params.id);
        reply.send({ ok: true });
      } catch (err) {
        if (err instanceof FriendError) {
          reply.code(err.statusCode).send({ error: err.message });
          return;
        }
        throw err;
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/friends/requests/:id/decline",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      try {
        await declineFriendRequest(request.currentUser!.id, request.params.id);
        reply.send({ ok: true });
      } catch (err) {
        if (err instanceof FriendError) {
          reply.code(err.statusCode).send({ error: err.message });
          return;
        }
        throw err;
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/friends/requests/:id/cancel",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      try {
        await cancelFriendRequest(request.currentUser!.id, request.params.id);
        reply.send({ ok: true });
      } catch (err) {
        if (err instanceof FriendError) {
          reply.code(err.statusCode).send({ error: err.message });
          return;
        }
        throw err;
      }
    }
  );

  app.get("/api/friends", { preHandler: app.requireAuth }, async (request) => {
    const rows = await listFriends(request.currentUser!.id);
    return { friends: rows.map((r) => ({ friendshipId: r.friendshipId, since: r.createdAt, user: publicUserSummary(r.user) })) };
  });

  app.delete<{ Params: { id: string } }>("/api/friends/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    await removeFriend(request.currentUser!.id, request.params.id);
    reply.send({ ok: true });
  });

  // Friend profile — public-ish info only, gated to actual friends (privacy
  // hook point: swap this check for a richer privacy-settings lookup later
  // without changing the route shape).
  app.get<{ Params: { id: string } }>("/api/friends/:id/profile", { preHandler: app.requireAuth }, async (request, reply) => {
    const isFriend = await areFriends(request.currentUser!.id, request.params.id);
    if (!isFriend) {
      reply.code(403).send({ error: "You can only view a friend's profile." });
      return;
    }
    const user = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!user) {
      reply.code(404).send({ error: "User not found." });
      return;
    }
    const [watchRow] = await db
      .select({
        totalMatches: sql<number>`count(*)`,
        totalMinutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      })
      .from(watchedMatches)
      .where(eq(watchedMatches.userId, user.id));

    const followStatus = await getFollowStatus(request.currentUser!.id, user.id);

    return {
      profile: {
        ...publicUserSummary(user),
        totalMinutes: Number(watchRow?.totalMinutes ?? 0),
        totalMatches: Number(watchRow?.totalMatches ?? 0),
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        memberSince: user.createdAt,
        ...followStatus,
      },
    };
  });

  // Public community user profile (accessible to all authenticated users)
  app.get<{ Params: { id: string } }>("/api/users/:id/profile", { preHandler: app.requireAuth }, async (request, reply) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!user) {
      reply.code(404).send({ error: "User not found." });
      return;
    }
    const [watchRow] = await db
      .select({
        totalMatches: sql<number>`count(*)`,
        totalMinutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      })
      .from(watchedMatches)
      .where(eq(watchedMatches.userId, user.id));

    const followStatus = await getFollowStatus(request.currentUser!.id, user.id);

    let supportedTeam = null;
    if (user.supportedTeamId) {
      const [team] = await db
        .select({
          id: teams.id,
          name: teams.name,
          shortName: teams.shortName,
          logoUrl: teams.logoUrl,
        })
        .from(teams)
        .where(eq(teams.id, user.supportedTeamId));
      supportedTeam = team ?? null;
    }

    return {
      profile: {
        ...publicUserSummary(user),
        supportedTeam,
        totalMinutes: Number(watchRow?.totalMinutes ?? 0),
        totalMatches: Number(watchRow?.totalMatches ?? 0),
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        memberSince: user.createdAt,
        ...followStatus,
      },
    };
  });

  app.post<{ Params: { id: string } }>("/api/users/:id/follow", { preHandler: app.requireAuth }, async (request, reply) => {
    try {
      const result = await followUser(request.currentUser!.id, request.params.id);
      reply.code(200).send(result);
    } catch (err) {
      if (err instanceof FriendError) {
        reply.code(err.statusCode).send({ error: err.message });
        return;
      }
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>("/api/users/:id/follow", { preHandler: app.requireAuth }, async (request, reply) => {
    const result = await unfollowUser(request.currentUser!.id, request.params.id);
    reply.code(200).send(result);
  });

  app.get<{ Params: { id: string } }>("/api/users/:id/follow-status", { preHandler: app.requireAuth }, async (request) => {
    const status = await getFollowStatus(request.currentUser!.id, request.params.id);
    return status;
  });

  app.get("/api/friends/activity", { preHandler: app.requireAuth }, async (request) => {
    const rows = await getFriendActivityFeed(request.currentUser!.id);
    return {
      activity: rows.map((r) => ({
        id: r.activity.id,
        type: r.activity.type,
        summary: r.activity.summary,
        referenceId: r.activity.referenceId,
        createdAt: r.activity.createdAt,
        user: { id: r.user.id, username: r.user.username, avatar: r.user.avatar },
      })),
    };
  });

  // Friends-only leaderboard — based on minutes watched!
  app.get("/api/friends/leaderboard", { preHandler: app.requireAuth }, async (request) => {
    const friendRows = await listFriends(request.currentUser!.id);
    const userIds = [request.currentUser!.id, ...friendRows.map((r) => r.user.id)];

    const watchRows = await db
      .select({
        userId: watchedMatches.userId,
        minutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      })
      .from(watchedMatches)
      .where(inArray(watchedMatches.userId, userIds))
      .groupBy(watchedMatches.userId);

    const minutesMap = new Map(watchRows.map((r) => [r.userId, Number(r.minutes)]));

    const allUsers = [request.currentUser!, ...friendRows.map((r) => r.user)];
    const entries = allUsers
      .map((u) => ({
        userId: u.id,
        username: u.username,
        avatar: u.avatar,
        value: minutesMap.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.value - a.value);
    return { entries };
  });
}
