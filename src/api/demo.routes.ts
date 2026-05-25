import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { createMemoryService } from "../memory/memory-provider.js";
import { runSupportDemo } from "../demo/scenarios.js";

const DemoRunBodySchema = z
  .object({
    userId: z.string().min(1).default("customer_123")
  })
  .default({});

export async function registerDemoRoutes(app: FastifyInstance, env: Env) {
  const memory = createMemoryService(env);

  app.post("/api/demo/run", async (req, reply) => {
    const parsed = DemoRunBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const report = await runSupportDemo(env, { userId: parsed.data.userId });
    return reply.send(report);
  });

  app.delete("/api/demo/reset", async (req, reply) => {
    const userId = typeof (req.query as any)?.userId === "string" ? (req.query as any).userId : "customer_123";
    const result = await memory.resetUser({ userId });
    return reply.send({ userId, ...result });
  });
}
