import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  XTRACE_API_KEY: z.string().min(1, "XTRACE_API_KEY is required"),
  XTRACE_ORG_ID: z.string().min(1, "XTRACE_ORG_ID is required"),
  XTRACE_APP_ID: z.string().min(1).default("xtrace-memory-support-agent"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  PORT: z.coerce.number().int().positive().default(3000)
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const raw = {
    XTRACE_API_KEY: process.env.XTRACE_API_KEY,
    XTRACE_ORG_ID: process.env.XTRACE_ORG_ID,
    XTRACE_APP_ID: process.env.XTRACE_APP_ID,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    PORT: process.env.PORT
  };

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const pretty = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${pretty}`);
  }
  return parsed.data;
}

