import { AuditService } from "../audit/audit-service.js";
import { ConnectorService } from "../connector/connector-service.js";
import { FinanceMemoryService } from "../finance-memory/finance-memory-service.js";
import { ReconciliationService } from "../reconciliation/reconciliation-service.js";
import { WorkflowService } from "../workflow/workflow-service.js";

export type ReconciliationContainer = {
  auditService: AuditService;
  connectorService: ConnectorService;
  financeMemoryService: FinanceMemoryService;
  reconciliationService: ReconciliationService;
  workflowService: WorkflowService;
};

export function createReconciliationContainer(dataDir: string, secret: string): ReconciliationContainer {
  const auditService = new AuditService(dataDir);
  const connectorService = new ConnectorService(dataDir, secret);
  const financeMemoryService = new FinanceMemoryService(dataDir);
  const reconciliationService = new ReconciliationService(dataDir);
  const workflowService = new WorkflowService(
    connectorService,
    financeMemoryService,
    reconciliationService,
    auditService
  );

  return {
    auditService,
    connectorService,
    financeMemoryService,
    reconciliationService,
    workflowService
  };
}
