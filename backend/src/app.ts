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
    reply.code(500).send({ error: "Internal server error" });
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

  app.get("/api/health", async () => ({ ok: true, env: env.NODE_ENV }));

  app.get("/api/db-diagnostics", async () => {
    const result: any = {
      env: env.NODE_ENV,
      cwd: process.cwd(),
      hasDbUrl: !!env.DATABASE_URL,
      maskedUrl: env.DATABASE_URL ? env.DATABASE_URL.replace(/:[^:@]*@/, ":****@") : null,
    };

    const dumpCandidates = [
      path.resolve(__dirname, "data_dump.sql"),
      path.resolve(__dirname, "db/data_dump.sql"),
      path.resolve(__dirname, "../src/db/data_dump.sql"),
      path.resolve(__dirname, "../../src/db/data_dump.sql"),
      path.resolve(process.cwd(), "src/db/data_dump.sql"),
      path.resolve(process.cwd(), "backend/src/db/data_dump.sql"),
      path.resolve(process.cwd(), "dist/db/data_dump.sql"),
      path.resolve(process.cwd(), "backend/dist/db/data_dump.sql"),
    ];
    result.dumpSearch = dumpCandidates.map((p) => ({ path: p, exists: fs.existsSync(p) }));
    const foundDump = dumpCandidates.find((p) => fs.existsSync(p));
    result.dumpFound = foundDump ?? null;
    if (foundDump) {
      result.dumpSize = fs.statSync(foundDump).size;
    }

    try {
      const sslOption =
        env.NODE_ENV === "production" || env.DATABASE_URL.includes("sslmode=require")
          ? { rejectUnauthorized: false }
          : false;

      const rawSql = postgres(env.DATABASE_URL, {
        max: 1,
        ssl: sslOption,
      });

      const tables = await rawSql`
        SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'
      `;
      result.tables = tables.map((t: any) => t.tablename);

      if (result.tables.includes("users")) {
        const userCount = await rawSql`SELECT count(*) FROM users`;
        result.userCount = parseInt(userCount[0].count, 10);

        const vikas = await rawSql`SELECT id, username, supported_team_id FROM users WHERE username = 'VikasBhaskar'`;
        result.vikas = vikas[0] ?? null;
      }

      if (result.tables.includes("teams")) {
        const teamCount = await rawSql`SELECT count(*) FROM teams`;
        result.teamCount = parseInt(teamCount[0].count, 10);
      }

      await rawSql.end();
      result.ok = true;
    } catch (err: any) {
      result.ok = false;
      result.error = err.message;
      result.code = err.code;
      result.stack = err.stack;
    }

    return result;
  });

  app.post("/api/db-seed", async () => {
    try {
      const { ensureDatabaseSeeded } = await import("./db/restore-dump.js");
      const seedResult = await ensureDatabaseSeeded();
      return { ok: true, seedResult };
    } catch (err: any) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
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
