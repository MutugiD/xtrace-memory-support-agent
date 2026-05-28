import type { AuditService } from "../audit/audit-service.js";
import type { ConnectorService } from "../connector/connector-service.js";
import type { FinanceMemoryService } from "../finance-memory/finance-memory-service.js";
import type { ProviderName, ReconciliationRunRequest, ResolveMismatchInput } from "../shared/types.js";
import type { ReconciliationService } from "../reconciliation/reconciliation-service.js";

export class WorkflowService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly financeMemoryService: FinanceMemoryService,
    private readonly reconciliationService: ReconciliationService,
    private readonly auditService: AuditService
  ) {}

  async runReconciliation(request: ReconciliationRunRequest) {
    const providers: ProviderName[] = request.providers ?? ["quickbooks", "zoho"];

    await this.auditService.record({
      tenantId: request.tenantId,
      service: "workflow",
      action: "reconciliation.started",
      actorRole: request.actorRole,
      entityType: "tenant",
      entityId: request.tenantId,
      payload: { providers, startedBy: request.startedBy, idempotencyKey: request.idempotencyKey ?? null }
    });

    const datasets = Object.fromEntries(
      await Promise.all(
        providers.map(async (provider) => [provider, await this.connectorService.syncTenantData(request.tenantId, provider)] as const)
      )
    ) as Record<ProviderName, Awaited<ReturnType<ConnectorService["syncTenantData"]>>>;

    const context = await this.financeMemoryService.retrieveContext({
      tenantId: request.tenantId,
      topic: "reconciliation policy and source of truth"
    });

    const evaluation = await this.reconciliationService.evaluate({
      tenantId: request.tenantId,
      providers,
      datasets,
      contextBeliefs: context.beliefs,
      startedBy: request.startedBy,
      idempotencyKey: request.idempotencyKey
    });

    await this.financeMemoryService.recordBeliefs({
      tenantId: request.tenantId,
      runId: evaluation.run.id,
      source: "workflow",
      beliefs: [
        {
          key: "tenant.preferred_source_system",
          text: `QuickBooks and Zoho were reconciled together in run ${evaluation.run.id}.`,
          value: { providers }
        }
      ]
    });

    await this.auditService.record({
      tenantId: request.tenantId,
      service: "workflow",
      action: "reconciliation.completed",
      actorRole: request.actorRole,
      entityType: "reconciliation_run",
      entityId: evaluation.run.id,
      payload: {
        summary: evaluation.run.summary,
        mismatchCount: evaluation.mismatches.length
      }
    });

    return {
      ...evaluation,
      datasets
    };
  }

  async resolveMismatch(input: ResolveMismatchInput) {
    const resolution = await this.reconciliationService.resolveMismatch(input);
    await this.financeMemoryService.recordBeliefs({
      tenantId: input.tenantId,
      runId: resolution.runId,
      source: "manual_resolution",
      beliefs: [
        {
          key: "tenant.exception_resolution_rule",
          text: `Mismatch ${input.mismatchId} was resolved with action ${input.action}.`,
          value: {
            mismatchId: input.mismatchId,
            action: input.action,
            notes: input.notes ?? null
          }
        }
      ]
    });

    await this.auditService.record({
      tenantId: input.tenantId,
      service: "workflow",
      action: "mismatch.resolved",
      actorRole: input.actorRole,
      entityType: "mismatch",
      entityId: input.mismatchId,
      payload: {
        action: input.action,
        notes: input.notes ?? null
      }
    });

    return resolution;
  }
}
