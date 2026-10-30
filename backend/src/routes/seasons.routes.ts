import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { seasons } from "../db/schema/index.js";

export default async function seasonRoutes(app: FastifyInstance) {
  app.get("/api/seasons", async () => {
    const all = await db.select().from(seasons).orderBy(desc(seasons.startDate));
    return { seasons: all };
  });

  app.get("/api/seasons/current", async (request, reply) => {
    const active = await db.query.seasons.findFirst({ where: eq(seasons.isActive, true) });
    if (!active) {
      reply.code(404).send({ error: "No active season configured." });
      return;
    }
    return { season: active };
  });

  app.get<{ Params: { id: string } }>("/api/seasons/:id", async (request, reply) => {
    const season = await db.query.seasons.findFirst({ where: eq(seasons.id, request.params.id) });
    if (!season) {
      reply.code(404).send({ error: "Season not found." });
      return;
    }
    return { season };
  });
}
