import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { parseOrThrow } from "../lib/validate.js";
import {
  registerUser,
  loginUser,
  createSession,
  destroySession,
  AuthError,
} from "../services/auth.service.js";
import { SESSION_COOKIE_NAME } from "../plugins/auth.js";
import { env } from "../lib/env.js";
import { db } from "../db/client.js";
import { users, teams } from "../db/schema/index.js";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, underscores, dots, or hyphens")
    .refine((val) => !/\s/.test(val), "Username cannot contain spaces"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  avatar: z.string().trim().max(3000000).optional().nullable(),
  supportedTeamId: z.string().uuid("Invalid team ID").optional().nullable(),
  onboardingCompleted: z.boolean().optional(),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((val) => val.toLowerCase())
    .optional()
    .nullable(),
});

const loginSchema = z
  .object({
    username: z.string().trim().optional(),
    identifier: z.string().trim().optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine((data) => !!(data.username || data.identifier), {
    message: "Username is required",
    path: ["username"],
  });

const updateProfileSchema = z.object({
  avatar: z.string().trim().max(3000000).optional().nullable(),
  supportedTeamId: z.string().uuid("Invalid team ID").optional().nullable(),
  onboardingCompleted: z.boolean().optional(),
});

async function publicUser(user: typeof users.$inferSelect) {
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
      .where(eq(teams.id, user.supportedTeamId))
      .limit(1);
    supportedTeam = team ?? null;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    avatar: user.avatar ?? null,
    supportedTeamId: user.supportedTeamId ?? null,
    supportedTeam,
    onboardingCompleted: user.onboardingCompleted ?? false,
    totalXp: user.totalXp,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    createdAt: user.createdAt,
  };
}

function setSessionCookie(reply: any, sessionId: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  });
}

export default async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/check-username", async (request, reply) => {
    const username = (request.query as any)?.username as string | undefined;
    if (!username || !username.trim()) {
      return reply.code(400).send({ available: false, error: "Username is required" });
    }
    const clean = username.trim().toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${clean}`)
      .limit(1);
    return { available: existing.length === 0 };
  });

  app.post("/api/auth/register", async (request, reply) => {
    const body = parseOrThrow(registerSchema, request.body);
    const user = await registerUser(body);
    const session = await createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    reply.code(201).send({ user: await publicUser(user) });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body);
    const identifier = (body.username || body.identifier)!.trim();
    const user = await loginUser({ identifier, password: body.password });
    const session = await createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    reply.send({ user: await publicUser(user) });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    if (sessionId) await destroySession(sessionId);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.currentUser) {
      reply.code(401).send({ error: "Not authenticated" });
      return;
    }
    reply.send({ user: await publicUser(request.currentUser) });
  });

  app.patch("/api/auth/profile", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseOrThrow(updateProfileSchema, request.body);
    const userId = request.currentUser!.id;

    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.avatar !== undefined) {
      updates.avatar = body.avatar ? body.avatar.trim() : null;
    }
    if (body.supportedTeamId !== undefined) {
      if (body.supportedTeamId) {
        const [team] = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.id, body.supportedTeamId))
          .limit(1);
        if (!team) {
          return reply.code(400).send({ error: "Selected team does not exist." });
        }
        updates.supportedTeamId = team.id;
      } else {
        updates.supportedTeamId = null;
      }
      // Choosing or clearing a team fulfills onboarding
      updates.onboardingCompleted = true;
    }
    if (body.onboardingCompleted !== undefined) {
      updates.onboardingCompleted = body.onboardingCompleted;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    reply.send({ user: await publicUser(updatedUser) });
  });
}

// Re-export so the global error handler can special-case auth errors
export { AuthError };
