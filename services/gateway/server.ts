import "dotenv/config";
import { loadServiceEnv } from "../shared/service-env.js";
import { buildGatewayApp } from "./build-gateway-app.js";

async function main() {
  const env = loadServiceEnv();
  const app = await buildGatewayApp({
    dataDir: env.dataDir,
    secret: env.secret,
    logger: true
  });

  await app.listen({ host: "0.0.0.0", port: env.gatewayPort });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
