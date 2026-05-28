// Force IPv4 for XTrace API calls — in WSL and some Linux environments,
// Node's undici-based fetch resolves IPv6 first and times out connecting
// to api.production.xtrace.ai. We patch globalThis.fetch to force IPv4.
//
// This MUST be imported before any XTrace SDK code runs.
import * as dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import { loadEnv } from "./config.js";
import { buildApp } from "./app.js";

async function main() {
  const env = loadEnv();
  const app = await buildApp(env, { logger: true });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
