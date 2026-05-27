import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  XTRACE_API_KEY: z.string().optional(),
  XTRACE_ORG_ID: z.string().optional(),
  XTRACE_APP_ID: z.string().min(1).default("xtrace-memory-support-agent"),
  XTRACE_MOCK: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  MEMORY_BACKEND: z
    .enum(["local", "mock", "xtrace"])
    .optional()
    .default("local"),
  LOCAL_DB_PATH: z.string().min(1).optional().default("./data/memory.sqlite"),
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
    XTRACE_MOCK: process.env.XTRACE_MOCK,
    MEMORY_BACKEND: process.env.MEMORY_BACKEND,
    LOCAL_DB_PATH: process.env.LOCAL_DB_PATH,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    PORT: process.env.PORT
  };

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const pretty = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${pretty}`);
  }
  const env = parsed.data;

  // Backwards-compatible shortcut: XTRACE_MOCK=1 forces MEMORY_BACKEND=mock.
  const resolvedBackend = env.XTRACE_MOCK ? "mock" : env.MEMORY_BACKEND;
  (env as any).MEMORY_BACKEND = resolvedBackend;

  if (resolvedBackend === "xtrace") {
    if (!env.XTRACE_API_KEY) throw new Error("XTRACE_API_KEY is required when MEMORY_BACKEND=xtrace.");
    if (!env.XTRACE_ORG_ID) throw new Error("XTRACE_ORG_ID is required when MEMORY_BACKEND=xtrace.");
  }

  return env as Env;
}
