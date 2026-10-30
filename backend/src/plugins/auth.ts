import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getUserForSession } from "../services/auth.service.js";
import type { users } from "../db/schema/index.js";

export const SESSION_COOKIE_NAME = "matchlog_session";

type User = typeof users.$inferSelect;

declare module "fastify" {
  interface FastifyRequest {
    currentUser: User | null;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorateRequest("currentUser", null);

  app.addHook("onRequest", async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      request.currentUser = null;
      return;
    }
    request.currentUser = await getUserForSession(sessionId);
  });

  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      return reply.code(401).send({ error: "Authentication required." });
    }
  });
});
