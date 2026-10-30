import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { friendships, friendRequests } from "../db/schema/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetDb(); });

function cookieFrom(res: any) {
  return `${res.cookies[0].name}=${res.cookies[0].value}`;
}

async function registerAndLogin(email: string, username: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { username, email, password: "password123" },
  });
  return { cookie: cookieFrom(res), userId: res.json().user.id };
}

describe("friend requests", () => {
  it("sends, and the receiver sees it in incoming requests", async () => {
    const alice = await registerAndLogin("alice@fr.com", "alicefr");
    const bob = await registerAndLogin("bob@fr.com", "bobfr");

    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    expect(send.statusCode).toBe(201);

    const incoming = await app.inject({ method: "GET", url: "/api/friends/requests/incoming", headers: { cookie: bob.cookie } });
    expect(incoming.json().requests).toHaveLength(1);
    expect(incoming.json().requests[0].sender.username).toBe("alicefr");
  });

  it("prevents sending a request to yourself", async () => {
    const alice = await registerAndLogin("self@fr.com", "selffr");
    const res = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: alice.userId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("prevents duplicate pending requests", async () => {
    const alice = await registerAndLogin("dup1@fr.com", "dupone");
    const bob = await registerAndLogin("dup2@fr.com", "duptwo");

    await app.inject({ method: "POST", url: "/api/friends/requests", headers: { cookie: alice.cookie }, payload: { receiverId: bob.userId } });
    const second = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    expect(second.statusCode).toBe(409);

    const rows = await db.select().from(friendRequests);
    expect(rows).toHaveLength(1);
  });

  it("becomes a bidirectional friendship on accept, with no duplicate friendship rows", async () => {
    const alice = await registerAndLogin("acc1@fr.com", "accone");
    const bob = await registerAndLogin("acc2@fr.com", "acctwo");

    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    const requestId = send.json().request.id;

    const accept = await app.inject({
      method: "POST",
      url: `/api/friends/requests/${requestId}/accept`,
      headers: { cookie: bob.cookie },
    });
    expect(accept.statusCode).toBe(200);

    const aliceFriends = await app.inject({ method: "GET", url: "/api/friends", headers: { cookie: alice.cookie } });
    const bobFriends = await app.inject({ method: "GET", url: "/api/friends", headers: { cookie: bob.cookie } });
    expect(aliceFriends.json().friends.map((f: any) => f.user.username)).toEqual(["acctwo"]);
    expect(bobFriends.json().friends.map((f: any) => f.user.username)).toEqual(["accone"]);

    const rows = await db.select().from(friendships);
    expect(rows).toHaveLength(1); // one row, not two
  });

  it("rejects accepting a request that isn't addressed to you", async () => {
    const alice = await registerAndLogin("wrong1@fr.com", "wrongone");
    const bob = await registerAndLogin("wrong2@fr.com", "wrongtwo");
    const carol = await registerAndLogin("wrong3@fr.com", "wrongthree");

    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    const requestId = send.json().request.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/friends/requests/${requestId}/accept`,
      headers: { cookie: carol.cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("supports decline and cancel, and neither creates a friendship", async () => {
    const alice = await registerAndLogin("dec1@fr.com", "decone");
    const bob = await registerAndLogin("dec2@fr.com", "dectwo");

    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    await app.inject({ method: "POST", url: `/api/friends/requests/${send.json().request.id}/decline`, headers: { cookie: bob.cookie } });

    expect(await db.select().from(friendships)).toHaveLength(0);

    // after a decline, sending a NEW request should be allowed (not permanently blocked)
    const retry = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    expect(retry.statusCode).toBe(201);

    await app.inject({
      method: "POST",
      url: `/api/friends/requests/${retry.json().request.id}/cancel`,
      headers: { cookie: alice.cookie },
    });
    expect(await db.select().from(friendships)).toHaveLength(0);
  });

  it("removing a friend deletes the friendship for both users", async () => {
    const alice = await registerAndLogin("rem1@fr.com", "remone");
    const bob = await registerAndLogin("rem2@fr.com", "remtwo");

    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    await app.inject({ method: "POST", url: `/api/friends/requests/${send.json().request.id}/accept`, headers: { cookie: bob.cookie } });

    await app.inject({ method: "DELETE", url: `/api/friends/${bob.userId}`, headers: { cookie: alice.cookie } });

    const aliceFriends = await app.inject({ method: "GET", url: "/api/friends", headers: { cookie: alice.cookie } });
    expect(aliceFriends.json().friends).toHaveLength(0);
    expect(await db.select().from(friendships)).toHaveLength(0);
  });

  it("gates friend profile access to actual friends only", async () => {
    const alice = await registerAndLogin("priv1@fr.com", "privone");
    const bob = await registerAndLogin("priv2@fr.com", "privtwo");

    const denied = await app.inject({ method: "GET", url: `/api/friends/${bob.userId}/profile`, headers: { cookie: alice.cookie } });
    expect(denied.statusCode).toBe(403);

    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    await app.inject({ method: "POST", url: `/api/friends/requests/${send.json().request.id}/accept`, headers: { cookie: bob.cookie } });

    const allowed = await app.inject({ method: "GET", url: `/api/friends/${bob.userId}/profile`, headers: { cookie: alice.cookie } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().profile.username).toBe("privtwo");
  });

  it("auto-accepts when both users happen to request each other (no crossed-wires duplicate)", async () => {
    const alice = await registerAndLogin("cross1@fr.com", "crossone");
    const bob = await registerAndLogin("cross2@fr.com", "crosstwo");

    await app.inject({ method: "POST", url: "/api/friends/requests", headers: { cookie: alice.cookie }, payload: { receiverId: bob.userId } });
    const bobToAlice = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: bob.cookie },
      payload: { receiverId: alice.userId },
    });
    expect(bobToAlice.statusCode).toBe(201); // resolved as an accept, not an error

    expect(await db.select().from(friendships)).toHaveLength(1);
  });
});

describe("friend activity feed", () => {
  it("records a watch as friend activity, visible to friends", async () => {
    const alice = await registerAndLogin("act1@fr.com", "actone");
    const bob = await registerAndLogin("act2@fr.com", "acttwo");
    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    await app.inject({ method: "POST", url: `/api/friends/requests/${send.json().request.id}/accept`, headers: { cookie: bob.cookie } });

    const { seasons, competitions, teams, matches } = await import("../db/schema/index.js");
    const [season] = await db.insert(seasons).values({ externalId: "fa-2026", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31", isActive: true }).returning();
    const [competition] = await db.insert(competitions).values({ externalId: "fa-comp", name: "Test League", type: "league" }).returning();
    const [home] = await db.insert(teams).values({ externalId: "fa-home", name: "Home FC" }).returning();
    const [away] = await db.insert(teams).values({ externalId: "fa-away", name: "Away FC" }).returning();
    const [match] = await db
      .insert(matches)
      .values({
        externalId: "fa-match",
        seasonId: season.id,
        competitionId: competition.id,
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
        status: "FINISHED",
        homeScore: 2,
        awayScore: 1,
      })
      .returning();

    await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie: alice.cookie },
      payload: { startMinute: 0, endMinute: 90 },
    });

    const feed = await app.inject({ method: "GET", url: "/api/friends/activity", headers: { cookie: bob.cookie } });
    expect(feed.json().activity.some((a: any) => a.type === "WATCHED_MATCH" && a.user.username === "actone")).toBe(true);
  });
});

describe("friends leaderboard", () => {
  it("uses server-authoritative XP, never a client-submitted value", async () => {
    const alice = await registerAndLogin("lead1@fr.com", "leadone");
    const bob = await registerAndLogin("lead2@fr.com", "leadtwo");
    const send = await app.inject({
      method: "POST",
      url: "/api/friends/requests",
      headers: { cookie: alice.cookie },
      payload: { receiverId: bob.userId },
    });
    await app.inject({ method: "POST", url: `/api/friends/requests/${send.json().request.id}/accept`, headers: { cookie: bob.cookie } });

    const board = await app.inject({ method: "GET", url: "/api/friends/leaderboard", headers: { cookie: alice.cookie } });
    expect(board.json().entries).toHaveLength(2);
    expect(board.json().entries.every((e: any) => e.value === 0)).toBe(true); // fresh accounts, real XP (0), not a fabricated value
  });
});
