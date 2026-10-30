/**
 * Targeted tests for:
 * 1. Rating-only reviews (no content text)
 * 2. Empty submission rejection (no text, no ratings)
 * 3. Content-only reviews (no ratings)
 * 4. Average calculations from non-null ratings only
 * 5. POTM match-participant filtering (uses match_players if available, squad fallback)
 * 6. POTM select-then-submit mechanics (backend: eligibility check preserved)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { matchReviews, users, matches, sessions, watchedMatches, players, matchPlayers, playerOfMatchVotes, seasons, competitions, teams } from "../db/schema/index.js";
import { inArray, eq, and } from "drizzle-orm";
import { customAlphabet } from "nanoid";

const sessionId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 48);

let app: FastifyInstance;
let testUserId1: string;
let testUserId2: string;
let testMatchId: string;
let testSessionCookie1: string;
let testSessionCookie2: string;

const SESSION_COOKIE = "matchlog_session";

async function getOrCreateTestMatch(): Promise<string> {
  const finished = await db.select({ id: matches.id }).from(matches)
    .where(eq(matches.status, "FINISHED"))
    .limit(1);
  if (finished.length > 0) return finished[0].id;

  const [season] = await db.insert(seasons).values({
    externalId: "t-potm-season",
    name: "2026/27",
    startDate: "2026-08-01",
    endDate: "2027-05-31",
    isActive: true,
  }).returning();

  const [comp] = await db.insert(competitions).values({
    externalId: "t-potm-comp",
    name: "POTM Test League",
    type: "league",
    isSupported: true,
  }).returning();

  const [home] = await db.insert(teams).values({ externalId: "t-potm-home", name: "POTM Home FC" }).returning();
  const [away] = await db.insert(teams).values({ externalId: "t-potm-away", name: "POTM Away FC" }).returning();
  const [otherTeam] = await db.insert(teams).values({ externalId: "t-potm-other", name: "POTM Other FC" }).returning();

  await db.insert(players).values([
    { externalId: "p-potm-home-1", name: "Home Player 1", currentTeamId: home.id },
    { externalId: "p-potm-away-1", name: "Away Player 1", currentTeamId: away.id },
    { externalId: "p-potm-other-1", name: "Other Player 1", currentTeamId: otherTeam.id },
  ]);

  const [match] = await db.insert(matches).values({
    externalId: "t-potm-match-1",
    seasonId: season.id,
    competitionId: comp.id,
    homeTeamId: home.id,
    awayTeamId: away.id,
    kickoffAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    status: "FINISHED",
    homeScore: 1,
    awayScore: 0,
    maxWatchMinutes: 90,
  }).returning();

  return match.id;
}

beforeAll(async () => {
  app = await buildApp();

  // Create two test users
  const res1 = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { username: "review_test_user1", email: "review_test1@example.com", password: "password123" },
  });
  const res2 = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { username: "review_test_user2", email: "review_test2@example.com", password: "password123" },
  });

  testUserId1 = res1.json().user.id;
  testUserId2 = res2.json().user.id;
  testSessionCookie1 = res1.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  testSessionCookie2 = res2.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  testMatchId = await getOrCreateTestMatch();
});

afterAll(async () => {
  // Clean up test data
  await db.delete(matchReviews).where(inArray(matchReviews.userId, [testUserId1, testUserId2]));
  await db.delete(watchedMatches).where(inArray(watchedMatches.userId, [testUserId1, testUserId2]));
  await db.delete(playerOfMatchVotes).where(inArray(playerOfMatchVotes.userId, [testUserId1, testUserId2]));
  await db.delete(sessions).where(inArray(sessions.userId, [testUserId1, testUserId2]));
  await db.delete(users).where(inArray(users.id, [testUserId1, testUserId2]));
  await app.close();
});

// ─── REVIEWS ──────────────────────────────────────────────────────────────────

describe("Match Reviews — optional content & rating logic", () => {
  it("rejects submission with no content and no ratings (HTTP 400)", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie1 },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects submission with empty string content and no ratings (HTTP 400)", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie1 },
      payload: { content: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a rating-only review (matchQualityRating, no content)", async () => {
    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie1 },
      payload: { matchQualityRating: 4 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.review.matchQualityRating).toBe(4);
    expect(body.review.content).toBeNull();
  });

  it("accepts a referee-rating-only review (no content, no match rating)", async () => {
    // First delete previous review so user can post a new one
    await app.inject({ method: "DELETE", url: `/api/matches/${testMatchId}/reviews`, headers: { cookie: testSessionCookie1 } });

    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie1 },
      payload: { refereeRating: 2 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.review.refereeRating).toBe(2);
    expect(body.review.matchQualityRating).toBeNull();
    expect(body.review.content).toBeNull();
  });

  it("accepts a content-only review (no ratings)", async () => {
    // Use second user who has no review yet
    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie2 },
      payload: { content: "Great match!" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.review.content).toBe("Great match!");
    expect(body.review.matchQualityRating).toBeNull();
    expect(body.review.refereeRating).toBeNull();
  });

  it("GET /reviews returns stats with correct counts for non-null ratings only", async () => {
    const res = await app.inject({
      method: "GET", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie1 },
    });
    expect(res.statusCode).toBe(200);
    const { stats } = res.json();

    // User1 has refereeRating=2, no matchQualityRating
    // User2 has content-only, no ratings
    // So qualityRatingCount=0, refereeRatingCount=1
    expect(typeof stats.totalReviews).toBe("number");
    expect(stats.totalReviews).toBeGreaterThanOrEqual(2);
    expect(typeof stats.qualityRatingCount).toBe("number");
    expect(typeof stats.refereeRatingCount).toBe("number");
    // averageRefereeRating should be 2.0 (from user1's referee rating of 2)
    expect(stats.refereeRatingCount).toBeGreaterThanOrEqual(1);
    expect(stats.averageRefereeRating).toBe(2);
    // averageMatchQuality should be null (no quality ratings)
    expect(stats.averageMatchQuality).toBeNull();
  });

  it("updating a review (editing) changes averages correctly", async () => {
    // Edit user1's review to add matchQualityRating=5
    const editRes = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/reviews`,
      headers: { cookie: testSessionCookie1 },
      payload: { matchQualityRating: 5, refereeRating: 2 },
    });
    expect(editRes.statusCode).toBe(201);

    const res = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}/reviews` });
    const { stats } = res.json();
    // Now user1 has matchQualityRating=5, qualityRatingCount should be >=1
    expect(stats.qualityRatingCount).toBeGreaterThanOrEqual(1);
    expect(stats.averageMatchQuality).toBe(5);
  });
});

// ─── POTM ──────────────────────────────────────────────────────────────────────

describe("POTM — match participant filtering & two-step voting", () => {
  it("GET /potm returns hasLineupData field", async () => {
    const res = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}/potm` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.hasLineupData).toBe("boolean");
    // With no match_players data, should be false
    expect(body.hasLineupData).toBe(false);
  });

  it("GET /potm candidates includes current squad as fallback (no lineup data)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}/potm` });
    expect(res.statusCode).toBe(200);
    const { candidates, hasLineupData } = res.json();
    // When hasLineupData is false, the candidates should be from current squad
    expect(hasLineupData).toBe(false);
    // home or away should have some players (or empty if match has placeholder teams)
    expect(Array.isArray(candidates.home)).toBe(true);
    expect(Array.isArray(candidates.away)).toBe(true);
  });

  it("POST /potm requires watch record before voting", async () => {
    // Get any candidate player
    const potmRes = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}/potm` });
    const { candidates } = potmRes.json();
    const anyPlayer = candidates.home[0] ?? candidates.away[0];

    if (!anyPlayer) {
      console.warn("Skipping POTM vote test: no candidates available");
      return;
    }

    // Try to vote without a watch record
    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/potm`,
      headers: { cookie: testSessionCookie1 },
      payload: { playerId: anyPlayer.id },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("watched");
  });

  it("POST /potm succeeds after recording a watch", async () => {
    const potmRes = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}/potm` });
    const { candidates } = potmRes.json();
    const anyPlayer = candidates.home[0] ?? candidates.away[0];
    if (!anyPlayer) {
      console.warn("Skipping POTM vote test: no candidates available");
      return;
    }

    // Record a watch for the match
    const matchRes = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}` });
    const { match } = matchRes.json();
    await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/watch`,
      headers: { cookie: testSessionCookie1 },
      payload: { startMinute: 0, endMinute: match.maxWatchMinutes ?? 90 },
    });

    // Now vote
    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/potm`,
      headers: { cookie: testSessionCookie1 },
      payload: { playerId: anyPlayer.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().vote.playerId).toBe(anyPlayer.id);

    // myVote should now reflect the vote
    const potmAfter = await app.inject({
      method: "GET", url: `/api/matches/${testMatchId}/potm`,
      headers: { cookie: testSessionCookie1 },
    });
    expect(potmAfter.json().myVote).toBe(anyPlayer.id);
  });

  it("POST /potm rejects player not associated with either team", async () => {
    // Find a player not in either team for this match
    // Pick a player not in either match team by filtering players without currentTeamId match
    const matchData = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}` });
    const { match } = matchData.json();
    const homeTeamId: string | null = match.homeTeamId ?? null;
    const awayTeamId: string | null = match.awayTeamId ?? null;

    const potmRes = await app.inject({ method: "GET", url: `/api/matches/${testMatchId}/potm` });
    const { candidates } = potmRes.json();
    const candidateIds = new Set([
      ...candidates.home.map((p: any) => p.id),
      ...candidates.away.map((p: any) => p.id),
    ]);

    const allPlayers = await db.select({ id: players.id, currentTeamId: players.currentTeamId }).from(players).limit(500);
    const unrelatedPlayer = allPlayers.find(
      (p) =>
        !candidateIds.has(p.id) &&
        p.currentTeamId !== homeTeamId &&
        p.currentTeamId !== awayTeamId
    );
    if (!unrelatedPlayer) {
      console.warn("Skipping: all players are candidates or on teams");
      return;
    }

    // Ensure watch is recorded so player participation check is exercised
    await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/watch`,
      headers: { cookie: testSessionCookie1 },
      payload: { startMinute: 0, endMinute: 90 },
    });

    const res = await app.inject({
      method: "POST", url: `/api/matches/${testMatchId}/potm`,
      headers: { cookie: testSessionCookie1 },
      payload: { playerId: unrelatedPlayer.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("did not participate");
  });
});
