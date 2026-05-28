import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { createReconciliationContainer, type ReconciliationContainer } from "./service-container.js";
import { assertRoleAllowed } from "../shared/security.js";
import type { ConnectionMode, ProviderName, ServiceRole } from "../shared/types.js";

const RoleSchema = z.enum(["admin", "operator", "reviewer", "read_only"]);
const ProviderSchema = z.enum(["quickbooks", "zoho"]);
const ConnectionModeSchema = z.enum(["sandbox", "file"]);

const ConnectBodySchema = z.object({
  provider: ProviderSchema,
  mode: ConnectionModeSchema.default("sandbox"),
  fixturePath: z.string().optional(),
  credentials: z.record(z.string()).optional()
});

const FinanceBeliefSchema = z.object({
  key: z.enum([
    "tenant.account_mapping",
    "tenant.customer_alias",
    "tenant.vendor_alias",
    "tenant.reconciliation_tolerance",
    "tenant.preferred_source_system",
    "tenant.exception_resolution_rule"
  ]),
  text: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown())]).optional(),
  scope: z.string().optional(),
  source: z.string().optional()
});

const RunBodySchema = z.object({
  providers: z.array(ProviderSchema).optional(),
  idempotencyKey: z.string().min(1).optional()
});

const ResolveBodySchema = z.object({
  action: z.enum(["accept_source", "write_off", "remap_entity", "ignore_once", "resolved_manually"]),
  notes: z.string().optional()
});

function headersToContext(headers: Record<string, unknown>) {
  const tenantId = z.string().min(1).parse(headers["x-tenant-id"]);
  const actorRole = RoleSchema.parse(headers["x-role"]);
  const actorId = typeof headers["x-actor-id"] === "string" && headers["x-actor-id"].trim()
    ? headers["x-actor-id"]
    : "system";
  return { tenantId, actorRole, actorId };
}

export async function buildGatewayApp(opts: {
  dataDir: string;
  secret: string;
  logger?: boolean;
  container?: ReconciliationContainer;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ? { level: "info" } : false
  });
  const container = opts.container ?? createReconciliationContainer(opts.dataDir, opts.secret);

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/reconciliation/connections", async (req, reply) => {
    const { tenantId } = headersToContext(req.headers as Record<string, unknown>);
    const connections = await container.connectorService.listConnections(tenantId);
    return reply.send({ tenantId, connections });
  });

  app.post("/api/reconciliation/connectors/connect", async (req, reply) => {
    const { tenantId, actorRole, actorId } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator"]);
    const body = ConnectBodySchema.parse(req.body ?? {});
    const connection = await container.connectorService.connectTenant({
      tenantId,
      provider: body.provider,
      mode: body.mode as ConnectionMode,
      fixturePath: body.fixturePath,
      credentials: body.credentials,
      connectedBy: actorId
    });
    await container.auditService.record({
      tenantId,
      service: "connector",
      action: "connector.connected",
      actorRole,
      entityType: "connector_connection",
      entityId: connection.id,
      payload: {
        provider: body.provider,
        mode: body.mode
      }
    });
    return reply.send({ connection });
  });

  app.post("/api/reconciliation/connectors/:provider/sync", async (req, reply) => {
    const { tenantId, actorRole } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator", "reviewer"]);
    const provider = ProviderSchema.parse((req.params as Record<string, unknown>).provider) as ProviderName;
    const dataset = await container.connectorService.syncTenantData(tenantId, provider);
    return reply.send({ tenantId, provider, dataset });
  });

  app.post("/api/reconciliation/memory/beliefs", async (req, reply) => {
    const { tenantId, actorRole } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator", "reviewer"]);
    const body = z.object({ beliefs: z.array(FinanceBeliefSchema).min(1) }).parse(req.body ?? {});
    const result = await container.financeMemoryService.recordBeliefs({
      tenantId,
      source: "gateway",
      beliefs: body.beliefs
    });
    return reply.send(result);
  });

  app.get("/api/reconciliation/memory", async (req, reply) => {
    const { tenantId } = headersToContext(req.headers as Record<string, unknown>);
    const scope = typeof (req.query as Record<string, unknown>).scope === "string" ? String((req.query as Record<string, unknown>).scope) : undefined;
    const beliefs = await container.financeMemoryService.listActiveBeliefs({ tenantId, scope });
    return reply.send({ tenantId, beliefs });
  });

  app.get("/api/reconciliation/memory/timeline", async (req, reply) => {
    const { tenantId } = headersToContext(req.headers as Record<string, unknown>);
    const scope = typeof (req.query as Record<string, unknown>).scope === "string" ? String((req.query as Record<string, unknown>).scope) : undefined;
    const timeline = await container.financeMemoryService.listTimeline({ tenantId, scope });
    return reply.send({ tenantId, timeline });
  });

  app.post("/api/reconciliation/runs", async (req, reply) => {
    const { tenantId, actorRole, actorId } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator"]);
    const body = RunBodySchema.parse(req.body ?? {});
    const idempotencyKey =
      body.idempotencyKey ??
      (typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined);

    const result = await container.workflowService.runReconciliation({
      tenantId,
      startedBy: actorId,
      actorRole,
      providers: body.providers,
      idempotencyKey
    });

    return reply.send(result);
  });

  app.get("/api/reconciliation/runs", async (req, reply) => {
    const { tenantId } = headersToContext(req.headers as Record<string, unknown>);
    const runs = await container.reconciliationService.listRuns(tenantId);
    return reply.send({ tenantId, runs });
  });

  app.get("/api/reconciliation/runs/:runId", async (req, reply) => {
    const { tenantId } = headersToContext(req.headers as Record<string, unknown>);
    const runId = z.string().min(1).parse((req.params as Record<string, unknown>).runId);
    const run = await container.reconciliationService.getRun(tenantId, runId);
    if (!run) return reply.code(404).send({ error: "Run not found" });
    const mismatches = await container.reconciliationService.listMismatches(tenantId, runId);
    return reply.send({ run, mismatches });
  });

  app.post("/api/reconciliation/mismatches/:mismatchId/resolve", async (req, reply) => {
    const { tenantId, actorRole } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator", "reviewer"]);
    const mismatchId = z.string().min(1).parse((req.params as Record<string, unknown>).mismatchId);
    const body = ResolveBodySchema.parse(req.body ?? {});
    const resolution = await container.workflowService.resolveMismatch({
      tenantId,
      mismatchId,
      action: body.action,
      notes: body.notes,
      actorRole
    });
    return reply.send({ resolution });
  });

  app.get("/api/reconciliation/reports/:runId", async (req, reply) => {
    const { tenantId, actorRole } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator", "reviewer", "read_only"]);
    const runId = z.string().min(1).parse((req.params as Record<string, unknown>).runId);
    const report = await container.reconciliationService.exportReport(tenantId, runId);
    return reply.send(report);
  });

  app.get("/api/reconciliation/audit", async (req, reply) => {
    const { tenantId, actorRole } = headersToContext(req.headers as Record<string, unknown>);
    assertRoleAllowed(actorRole, ["admin", "operator", "reviewer", "read_only"]);
    const report = await container.auditService.buildReport(tenantId);
    return reply.send(report);
  });

  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: error.flatten() });
    }

    if (error.message.includes("Role")) {
      return reply.code(403).send({ error: error.message });
    }

    if (error.message.includes("No ") || error.message.includes("not found")) {
      return reply.code(404).send({ error: error.message });
    }

    return reply.code(500).send({ error: error.message });
  });

  return app;
}
