import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { createMemoryService } from "../memory/memory-provider.js";

const UserParamsSchema = z.object({
  userId: z.string().min(1)
});

const FactParamsSchema = z.object({
  userId: z.string().min(1),
  factId: z.string().min(1)
});

export async function registerMemoryRoutes(app: FastifyInstance, env: Env) {
  const memory = createMemoryService(env);

  app.get("/api/memory/:userId", async (req, reply) => {
    const params = UserParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const activeFacts = await memory.listFacts({ userId: params.data.userId, includeSuperseded: false });
    return reply.send({ userId: params.data.userId, facts: activeFacts });
  });

  app.get("/api/memory/:userId/timeline", async (req, reply) => {
    const params = UserParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const timeline = await memory.buildTimeline({ userId: params.data.userId });
    return reply.send({ userId: params.data.userId, timeline });
  });

  app.get("/api/memory/:userId/facts/:factId", async (req, reply) => {
    const params = FactParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    try {
      const fact = await memory.getMemoryById(params.data.factId);
      return reply.send({ fact });
    } catch (err: any) {
      if (err?.message?.includes("not found") || err?.status === 404) {
        return reply.code(404).send({ error: "Memory not found" });
      }
      return reply.code(500).send({ error: err?.message ?? "Internal error" });
    }
  });
}