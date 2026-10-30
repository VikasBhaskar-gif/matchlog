import argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { eq, and, gt, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, sessions } from "../db/schema/index.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const sessionId = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  48
);

export class AuthError extends Error {
  constructor(message: string, public statusCode = 401) {
    super(message);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function registerUser(input: {
  username: string;
  password: string;
  email?: string | null;
  avatar?: string | null;
  supportedTeamId?: string | null;
  onboardingCompleted?: boolean;
}) {
  if (/\s/.test(input.username)) {
    throw new AuthError("Username cannot contain spaces.", 400);
  }
  const trimmedUsername = input.username.trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
    throw new AuthError("Username may only contain letters, numbers, underscores, dots, or hyphens.", 400);
  }
  if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
    throw new AuthError("Username must be between 3 and 30 characters.", 400);
  }
  const normalizedUsername = trimmedUsername.toLowerCase();
  const normalizedEmail = input.email ? normalizeEmail(input.email) : null;

  if (normalizedEmail) {
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);
    if (existingEmail.length > 0) {
      throw new AuthError("An account with this email already exists.", 409);
    }
  }

  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${normalizedUsername}`)
    .limit(1);
  if (existingUsername.length > 0) {
    throw new AuthError("This username is taken.", 409);
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = await db
      .insert(users)
      .values({
        username: trimmedUsername,
        avatar: input.avatar?.trim() || null,
        supportedTeamId: input.supportedTeamId || null,
        onboardingCompleted: input.onboardingCompleted ?? (input.supportedTeamId !== undefined),
        email: normalizedEmail || null,
        passwordHash,
      })
      .returning();

    return user;
  } catch (err: any) {
    if (err?.code === "23505") {
      const constraint = (err.constraint || "").toLowerCase();
      const detail = (err.detail || err.message || "").toLowerCase();
      if (constraint.includes("email") || detail.includes("email")) {
        throw new AuthError("An account with this email already exists.", 409);
      }
      if (constraint.includes("username") || detail.includes("username")) {
        throw new AuthError("This username is taken.", 409);
      }
      throw new AuthError("An account with these details already exists.", 409);
    }
    throw err;
  }
}

export async function loginUser(input: { identifier: string; password: string }) {
  const trimmedIdentifier = input.identifier.trim();
  const normalizedIdentifier = trimmedIdentifier.toLowerCase();

  if (!trimmedIdentifier) {
    throw new AuthError("Invalid credentials.", 401);
  }

  const candidateUsers = await db
    .select()
    .from(users)
    .where(
      or(
        sql`lower(${users.email}) = ${normalizedIdentifier}`,
        sql`lower(${users.username}) = ${normalizedIdentifier}`
      )
    )
    .limit(5);

  if (candidateUsers.length === 0) {
    throw new AuthError("Invalid credentials.", 401);
  }

  let user: typeof users.$inferSelect | undefined;

  if (candidateUsers.length === 1) {
    user = candidateUsers[0];
  } else {
    // Handle potential ambiguous matches without introducing ambiguity:
    if (trimmedIdentifier.includes("@")) {
      const emailMatches = candidateUsers.filter(
        (u) => u.email?.trim().toLowerCase() === normalizedIdentifier
      );
      if (emailMatches.length === 1) {
        user = emailMatches[0];
      }
    } else {
      const exactUsername = candidateUsers.filter((u) => u.username === trimmedIdentifier);
      if (exactUsername.length === 1) {
        user = exactUsername[0];
      } else {
        const usernameMatches = candidateUsers.filter(
          (u) => u.username.trim().toLowerCase() === normalizedIdentifier
        );
        if (usernameMatches.length === 1) {
          user = usernameMatches[0];
        }
      }
    }

    if (!user) {
      throw new AuthError("Invalid credentials.", 401);
    }
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) throw new AuthError("Invalid credentials.", 401);

  return user;
}

export async function createSession(userId: string) {
  const id = sessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function destroySession(id: string) {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function getUserForSession(id: string) {
  const now = new Date();
  const result = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);

  return result[0]?.user ?? null;
}
