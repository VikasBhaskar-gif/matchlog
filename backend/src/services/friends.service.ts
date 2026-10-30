import { and, eq, or, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, friendRequests, friendships, friendActivities, userFollows } from "../db/schema/index.js";

export class FriendError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

/** Friendships always store the lower UUID as userA — this is what makes
 * "does a friendship exist" a single unique-constrained lookup regardless of
 * who sent the original request. */
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function areFriends(userId: string, otherUserId: string): Promise<boolean> {
  const [a, b] = orderedPair(userId, otherUserId);
  const row = await db.query.friendships.findFirst({
    where: and(eq(friendships.userAId, a), eq(friendships.userBId, b)),
  });
  return !!row;
}

export async function sendFriendRequest(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw new FriendError("You can't send a friend request to yourself.");

  const receiver = await db.query.users.findFirst({ where: eq(users.id, receiverId) });
  if (!receiver) throw new FriendError("User not found.", 404);

  if (await areFriends(senderId, receiverId)) {
    throw new FriendError("You're already friends.", 409);
  }

  // If the other person already sent *us* a pending request, accept it
  // instead of creating a redundant mirror request.
  const reverse = await db.query.friendRequests.findFirst({
    where: and(eq(friendRequests.senderId, receiverId), eq(friendRequests.receiverId, senderId), eq(friendRequests.status, "PENDING")),
  });
  if (reverse) {
    return acceptFriendRequest(senderId, reverse.id);
  }

  const existing = await db.query.friendRequests.findFirst({
    where: and(eq(friendRequests.senderId, senderId), eq(friendRequests.receiverId, receiverId), eq(friendRequests.status, "PENDING")),
  });
  if (existing) throw new FriendError("You already have a pending request to this user.", 409);

  const [request] = await db.insert(friendRequests).values({ senderId, receiverId }).returning();
  return request;
}

export async function acceptFriendRequest(receiverId: string, requestId: string) {
  return db.transaction(async (tx) => {
    const request = await tx.query.friendRequests.findFirst({ where: eq(friendRequests.id, requestId) });
    if (!request) throw new FriendError("Friend request not found.", 404);
    if (request.receiverId !== receiverId) throw new FriendError("This request isn't addressed to you.", 403);
    if (request.status !== "PENDING") throw new FriendError("This request is no longer pending.", 409);

    await tx.update(friendRequests).set({ status: "ACCEPTED", updatedAt: new Date() }).where(eq(friendRequests.id, requestId));

    const [a, b] = orderedPair(request.senderId, request.receiverId);
    const [friendship] = await tx
      .insert(friendships)
      .values({ userAId: a, userBId: b })
      .onConflictDoNothing()
      .returning();

    return friendship;
  });
}

export async function declineFriendRequest(receiverId: string, requestId: string) {
  const request = await db.query.friendRequests.findFirst({ where: eq(friendRequests.id, requestId) });
  if (!request) throw new FriendError("Friend request not found.", 404);
  if (request.receiverId !== receiverId) throw new FriendError("This request isn't addressed to you.", 403);
  if (request.status !== "PENDING") throw new FriendError("This request is no longer pending.", 409);

  await db.update(friendRequests).set({ status: "DECLINED", updatedAt: new Date() }).where(eq(friendRequests.id, requestId));
}

export async function cancelFriendRequest(senderId: string, requestId: string) {
  const request = await db.query.friendRequests.findFirst({ where: eq(friendRequests.id, requestId) });
  if (!request) throw new FriendError("Friend request not found.", 404);
  if (request.senderId !== senderId) throw new FriendError("You can only cancel your own request.", 403);
  if (request.status !== "PENDING") throw new FriendError("This request is no longer pending.", 409);

  await db.update(friendRequests).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(friendRequests.id, requestId));
}

export async function removeFriend(userId: string, otherUserId: string) {
  const [a, b] = orderedPair(userId, otherUserId);
  await db.delete(friendships).where(and(eq(friendships.userAId, a), eq(friendships.userBId, b)));
}

export async function listFriends(userId: string) {
  const rows = await db
    .select({
      friendshipId: friendships.id,
      createdAt: friendships.createdAt,
      user: users,
    })
    .from(friendships)
    .innerJoin(users, or(eq(users.id, friendships.userAId), eq(users.id, friendships.userBId)))
    .where(and(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)), sql`${users.id} != ${userId}`));

  return rows;
}

export async function listIncomingRequests(userId: string) {
  return db
    .select({ request: friendRequests, sender: users })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.senderId))
    .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, "PENDING")))
    .orderBy(desc(friendRequests.createdAt));
}

export async function listOutgoingRequests(userId: string) {
  return db
    .select({ request: friendRequests, receiver: users })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.receiverId))
    .where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, "PENDING")))
    .orderBy(desc(friendRequests.createdAt));
}

export async function searchUsers(query: string, excludeUserId: string) {
  return db
    .select()
    .from(users)
    .where(and(sql`${users.username} ilike ${"%" + query + "%"}`, sql`${users.id} != ${excludeUserId}`))
    .limit(20);
}

// ---------------------------------------------------------------------------
// Activity feed — called from the services that already perform these
// actions (watch, prediction, achievements, levels), never from the client.
// ---------------------------------------------------------------------------
export async function recordFriendActivity(input: {
  userId: string;
  type: "WATCHED_MATCH" | "MADE_PREDICTION" | "UNLOCKED_ACHIEVEMENT" | "REACHED_LEVEL";
  summary: string;
  referenceId?: string;
}) {
  await db.insert(friendActivities).values(input);
}

export async function getFriendActivityFeed(userId: string, limit = 30) {
  const friends = await listFriends(userId);
  const friendIds = friends.map((f) => f.user.id);
  if (friendIds.length === 0) return [];

  return db
    .select({ activity: friendActivities, user: users })
    .from(friendActivities)
    .innerJoin(users, eq(users.id, friendActivities.userId))
    .where(inArray(friendActivities.userId, friendIds))
    .orderBy(desc(friendActivities.createdAt))
    .limit(limit);
}

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) throw new FriendError("Cannot follow yourself.", 400);

  const target = await db.query.users.findFirst({ where: eq(users.id, followingId) });
  if (!target) throw new FriendError("User not found.", 404);

  // Send a friend request instead
  try {
    const request = await sendFriendRequest(followerId, followingId);
    return { ok: true, request };
  } catch (err: any) {
    return { ok: true };
  }
}

export async function unfollowUser(followerId: string, followingId: string) {
  try {
    await removeFriend(followerId, followingId);
  } catch {}
  return { ok: true };
}

export async function getFriendshipStatus(currentUserId: string, targetUserId: string) {
  if (currentUserId === targetUserId) {
    const [friendsCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(friendships)
      .where(or(eq(friendships.userAId, targetUserId), eq(friendships.userBId, targetUserId)));

    return {
      isFriend: false,
      friendStatus: "SELF" as const,
      friendRequestId: null as string | null,
      friendshipId: null as string | null,
      friendsCount: Number(friendsCountRes?.count ?? 0),
      isFollowing: false,
      isFollowedBy: false,
      followersCount: 0,
      followingCount: 0,
    };
  }

  const [a, b] = orderedPair(currentUserId, targetUserId);

  const [friendship, outgoingRequest, incomingRequest, friendsCountRes] = await Promise.all([
    db.query.friendships.findFirst({
      where: and(eq(friendships.userAId, a), eq(friendships.userBId, b)),
    }),
    db.query.friendRequests.findFirst({
      where: and(
        eq(friendRequests.senderId, currentUserId),
        eq(friendRequests.receiverId, targetUserId),
        eq(friendRequests.status, "PENDING")
      ),
    }),
    db.query.friendRequests.findFirst({
      where: and(
        eq(friendRequests.senderId, targetUserId),
        eq(friendRequests.receiverId, currentUserId),
        eq(friendRequests.status, "PENDING")
      ),
    }),
    db.select({ count: sql<number>`count(*)` })
      .from(friendships)
      .where(or(eq(friendships.userAId, targetUserId), eq(friendships.userBId, targetUserId))),
  ]);

  const isFriend = !!friendship;
  let friendStatus: "SELF" | "FRIENDS" | "OUTGOING_PENDING" | "INCOMING_PENDING" | "NONE" = "NONE";
  let activeRequestId: string | null = null;

  if (isFriend) {
    friendStatus = "FRIENDS";
  } else if (outgoingRequest) {
    friendStatus = "OUTGOING_PENDING";
    activeRequestId = outgoingRequest.id;
  } else if (incomingRequest) {
    friendStatus = "INCOMING_PENDING";
    activeRequestId = incomingRequest.id;
  }

  return {
    isFriend,
    friendStatus,
    friendRequestId: activeRequestId,
    friendshipId: friendship?.id ?? null,
    friendsCount: Number(friendsCountRes[0]?.count ?? 0),
    isFollowing: false,
    isFollowedBy: false,
    followersCount: 0,
    followingCount: 0,
  };
}

export const getFollowStatus = getFriendshipStatus;

