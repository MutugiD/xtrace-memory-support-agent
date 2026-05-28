import path from "node:path";

export type ServiceEnv = {
  dataDir: string;
  secret: string;
  gatewayPort: number;
};

export function loadServiceEnv(): ServiceEnv {
  return {
    dataDir: process.env.RECONCILIATION_DATA_DIR || path.join(process.cwd(), "data", "reconciliation"),
    secret: process.env.SERVICE_TOKEN_SECRET || "dev-reconciliation-secret",
    gatewayPort: Number(process.env.RECONCILIATION_GATEWAY_PORT || 3400)
  };
}
