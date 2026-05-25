import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SupportAgent } from "../agent/support-agent.js";
import type { Env } from "../config.js";

const ChatBodySchema = z.object({
  userId: z.string().min(1),
  convId: z.string().min(1),
  message: z.string().min(1),
  mode: z.enum(["with_memory", "stateless"])
});

export async function registerChatRoutes(app: FastifyInstance, env: Env) {
  const agent = new SupportAgent(env);

  app.post("/api/chat", async (req, reply) => {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await agent.handleChatTurn({
      userId: parsed.data.userId,
      convId: parsed.data.convId,
      customerMessage: parsed.data.message,
      mode: parsed.data.mode
    });

    return reply.send({
      reply: result.reply,
      usedLlm: result.usedLlm,
      retrievedContextPrompt: result.retrieved.contextPrompt,
      retrievedMemories: result.retrieved.memories,
      writeResult: result.writeResult
    });
  });
}

