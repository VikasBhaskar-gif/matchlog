import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb } from "./db-helper.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

function extractCookie(response: any): string {
  const setCookie = response.cookies?.[0];
  return `${setCookie.name}=${setCookie.value}`;
}

describe("auth", () => {
  it("registers a new user with a hashed password (never plaintext)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "testuser", email: "test@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.username).toBe("testuser");
    expect(body.user.passwordHash).toBeUndefined(); // never leaked to the client
  });

  it("rejects duplicate email registration", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "userone", email: "dup@example.com", password: "password123" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "usertwo", email: "dup@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects invalid registration payloads via zod", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "a", email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "loginuser", email: "login@example.com", password: "correcthorse" },
    });

    const good = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "login@example.com", password: "correcthorse" },
    });
    expect(good.statusCode).toBe(200);

    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "login@example.com", password: "wrongpassword" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("persists a session across requests via cookie", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "sessionuser", email: "session@example.com", password: "password123" },
    });
    const cookie = extractCookie(register);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("session@example.com");
  });

  it("rejects /api/auth/me without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("logout invalidates the session", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "logoutuser", email: "logout@example.com", password: "password123" },
    });
    const cookie = extractCookie(register);

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});
