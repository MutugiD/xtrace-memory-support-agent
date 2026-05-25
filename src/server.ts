import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { loadEnv } from "./config.js";
import { registerHealthRoutes } from "./api/health.routes.js";
import { registerChatRoutes } from "./api/chat.routes.js";
import { registerMemoryRoutes } from "./api/memory.routes.js";
import { registerDemoRoutes } from "./api/demo.routes.js";

function findUiRoot(): string {
  const distUi = path.join(process.cwd(), "dist", "ui");
  const srcUi = path.join(process.cwd(), "src", "ui");
  if (fs.existsSync(distUi)) return distUi;
  return srcUi;
}

async function main() {
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  await app.register(fastifyStatic, {
    root: findUiRoot(),
    prefix: "/"
  });

  await registerHealthRoutes(app);
  await registerChatRoutes(app, env);
  await registerMemoryRoutes(app, env);
  await registerDemoRoutes(app, env);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

