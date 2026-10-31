import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./lib/env.js";
import { ValidationError } from "./lib/validate.js";
import { AuthError } from "./services/auth.service.js";
import authPlugin from "./plugins/auth.js";

import { db } from "./db/client.js";
import { competitions } from "./db/schema/index.js";
import { sql } from "drizzle-orm";
import authRoutes from "./routes/auth.routes.js";
import seasonRoutes from "./routes/seasons.routes.js";
import competitionRoutes from "./routes/competitions.routes.js";
import teamRoutes from "./routes/teams.routes.js";
import playerRoutes from "./routes/players.routes.js";
import matchRoutes from "./routes/matches.routes.js";
import watchRoutes from "./routes/watches.routes.js";
import predictionRoutes from "./routes/predictions.routes.js";
import potmRoutes from "./routes/potm.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import leaderboardRoutes from "./routes/leaderboards.routes.js";
import achievementRoutes from "./routes/achievements.routes.js";
import meRoutes from "./routes/me.routes.js";
import friendsRoutes from "./routes/friends.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({
    bodyLimit: 5242880, // 5MB limit for uploads (e.g. avatars)
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
    },
  });

  await app.register(helmet, {
    // The API serves JSON only; CSP is the frontend's concern.
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === env.APP_URL) return cb(null, true);
      if (origin.endsWith(".onrender.com") || origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return cb(null, true);
      }
      return cb(null, true);
    },
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(authPlugin);

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ValidationError) {
      reply.code(400).send({ error: error.message, issues: error.issues });
      return;
    }
    if (error instanceof AuthError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }
    if ((error as any).statusCode) {
      reply.code((error as any).statusCode).send({ error: (error as Error).message });
      return;
    }
    request.log.error(error);
    reply.code(500).send({
      error: "Internal server error",
      detail: (error as Error).message,
      code: (error as any).code,
    });
  });

  await app.register(authRoutes);
  await app.register(seasonRoutes);
  await app.register(competitionRoutes);
  await app.register(teamRoutes);
  await app.register(playerRoutes);
  await app.register(matchRoutes);
  await app.register(watchRoutes);
  await app.register(predictionRoutes);
  await app.register(potmRoutes);
  await app.register(statsRoutes);
  await app.register(leaderboardRoutes);
  await app.register(achievementRoutes);
  await app.register(meRoutes);
  await app.register(friendsRoutes);
  await app.register(reviewRoutes);

  app.get("/api/health", async () => {
    let dbStatus = "ok";
    let dbDetail: any = null;
    try {
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(competitions);
      dbDetail = { competitionsCount: Number(count) };
    } catch (e: any) {
      dbStatus = "error";
      dbDetail = { message: e.message, code: e.code };
    }
    return { ok: dbStatus === "ok", env: env.NODE_ENV, dbStatus, dbDetail };
  });

  const distCandidates = [
    path.resolve(__dirname, "../../frontend/dist"),
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist"),
  ];
  const clientDistPath = distCandidates.find((p) => fs.existsSync(p));

  if (clientDistPath) {
    app.log.info(`[Static] Serving frontend from: ${clientDistPath}`);
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url && request.raw.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  }

  return app;
}
