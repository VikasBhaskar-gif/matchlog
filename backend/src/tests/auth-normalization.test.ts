import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { users, sessions } from "../db/schema/index.js";
import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const createdUserIds: string[] = [];

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await app.close();
});

describe("targeted auth normalization & login tests", () => {
  it("normalizes email (trim & lowercase) on registration and stores normalized email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        username: "test_norm_user1",
        email: "   Test_Norm_User1@Example.COM   ",
        password: "password123",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe("test_norm_user1@example.com");
    expect(body.user.username).toBe("test_norm_user1");
    createdUserIds.push(body.user.id);

    // Verify stored email in database
    const dbUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, body.user.id),
    });
    expect(dbUser?.email).toBe("test_norm_user1@example.com");
  });

  it("rejects duplicate registration with identical normalized email (different casing/whitespace) with HTTP 409", async () => {
    const dupRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        username: "test_norm_user2",
        email: "TEST_NORM_USER1@EXAMPLE.COM",
        password: "password123",
      },
    });

    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error).toBe("An account with this email already exists.");

    const whitespaceDupRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        username: "test_norm_user3",
        email: "   test_norm_user1@example.com   ",
        password: "password123",
      },
    });

    expect(whitespaceDupRes.statusCode).toBe(409);
    expect(whitespaceDupRes.json().error).toBe("An account with this email already exists.");
  });

  it("rejects duplicate registration with case-insensitive username with HTTP 409", async () => {
    const dupUserRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        username: "TEST_NORM_USER1",
        email: "test_different_email@example.com",
        password: "password123",
      },
    });

    expect(dupUserRes.statusCode).toBe(409);
    expect(dupUserRes.json().error).toBe("This username is taken.");
  });

  it("supports login with email (exact, mixed-case, whitespace-padded)", async () => {
    // Exact email
    const exactRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "test_norm_user1@example.com",
        password: "password123",
      },
    });
    expect(exactRes.statusCode).toBe(200);
    expect(exactRes.json().user.email).toBe("test_norm_user1@example.com");

    // Uppercase email
    const upperRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "TEST_NORM_USER1@EXAMPLE.COM",
        password: "password123",
      },
    });
    expect(upperRes.statusCode).toBe(200);
    expect(upperRes.json().user.email).toBe("test_norm_user1@example.com");

    // Whitespace-padded email
    const whitespaceRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "   test_norm_user1@example.com   ",
        password: "password123",
      },
    });
    expect(whitespaceRes.statusCode).toBe(200);
    expect(whitespaceRes.json().user.email).toBe("test_norm_user1@example.com");
  });

  it("supports login with username (exact, mixed-case, whitespace-padded)", async () => {
    // Exact username
    const exactRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "test_norm_user1",
        password: "password123",
      },
    });
    expect(exactRes.statusCode).toBe(200);
    expect(exactRes.json().user.username).toBe("test_norm_user1");

    // Uppercase username
    const upperRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "TEST_NORM_USER1",
        password: "password123",
      },
    });
    expect(upperRes.statusCode).toBe(200);
    expect(upperRes.json().user.username).toBe("test_norm_user1");

    // Whitespace-padded username
    const whitespaceRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "   test_norm_user1   ",
        password: "password123",
      },
    });
    expect(whitespaceRes.statusCode).toBe(200);
    expect(whitespaceRes.json().user.username).toBe("test_norm_user1");
  });

  it("rejects login with invalid credentials (wrong password or non-existent user)", async () => {
    // Wrong password for email
    const wrongPassEmail = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "test_norm_user1@example.com",
        password: "wrongpassword",
      },
    });
    expect(wrongPassEmail.statusCode).toBe(401);
    expect(wrongPassEmail.json().error).toBe("Invalid credentials.");

    // Wrong password for username
    const wrongPassUser = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "test_norm_user1",
        password: "wrongpassword",
      },
    });
    expect(wrongPassUser.statusCode).toBe(401);
    expect(wrongPassUser.json().error).toBe("Invalid credentials.");

    // Non-existent user
    const nonExistent = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "nonexistent_account@example.com",
        password: "password123",
      },
    });
    expect(nonExistent.statusCode).toBe(401);
    expect(nonExistent.json().error).toBe("Invalid credentials.");
  });
});
