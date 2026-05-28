export type ProviderName = "quickbooks" | "zoho";

export type ServiceRole = "admin" | "operator" | "reviewer" | "read_only";

export type ConnectionMode = "sandbox" | "file";

export type MemoryStatus = "active" | "superseded" | "retracted";

export type MismatchType =
  | "missing_counterpart"
  | "amount_tolerance"
  | "amount_mismatch"
  | "duplicate_payment"
  | "stale_sync";

export type MismatchStatus = "open" | "resolved";

export type ResolutionAction = "accept_source" | "write_off" | "remap_entity" | "ignore_once" | "resolved_manually";

export type CanonicalAccount = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  externalId: string;
  code: string;
  name: string;
  type: string;
  updatedAt: string;
};

export type CanonicalInvoice = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  externalId: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  balance: number;
  currency: string;
  issuedAt: string;
  dueAt: string | null;
  status: string;
  updatedAt: string;
};

export type CanonicalPayment = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  externalId: string;
  invoiceNumbers: string[];
  amount: number;
  currency: string;
  paidAt: string;
  reference: string;
  updatedAt: string;
};

export type CanonicalJournalEntry = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  externalId: string;
  reference: string;
  amount: number;
  currency: string;
  postedAt: string;
  updatedAt: string;
};

export type CanonicalCustomer = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  externalId: string;
  displayName: string;
  email: string | null;
  updatedAt: string;
};

export type CanonicalVendor = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  externalId: string;
  displayName: string;
  email: string | null;
  updatedAt: string;
};

export type SyncCheckpoint = {
  provider: ProviderName;
  entity: "accounts" | "invoices" | "payments" | "journalEntries" | "customers" | "vendors";
  cursor: string;
  syncedAt: string;
};

export type ProviderDataset = {
  provider: ProviderName;
  tenantId: string;
  syncedAt: string;
  accounts: CanonicalAccount[];
  invoices: CanonicalInvoice[];
  payments: CanonicalPayment[];
  journalEntries: CanonicalJournalEntry[];
  customers: CanonicalCustomer[];
  vendors: CanonicalVendor[];
  checkpoints: SyncCheckpoint[];
  rawSummary: {
    source: ConnectionMode;
    recordsRead: number;
  };
};

export type ConnectorConnectionRequest = {
  tenantId: string;
  provider: ProviderName;
  mode?: ConnectionMode;
  fixturePath?: string;
  credentials?: Record<string, string>;
  connectedBy: string;
};

export type ConnectorConnectionRecord = {
  id: string;
  tenantId: string;
  provider: ProviderName;
  mode: ConnectionMode;
  fixturePath: string | null;
  encryptedCredentials: string;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt: string | null;
};

export type FinanceBeliefInput = {
  key:
    | "tenant.account_mapping"
    | "tenant.customer_alias"
    | "tenant.vendor_alias"
    | "tenant.reconciliation_tolerance"
    | "tenant.preferred_source_system"
    | "tenant.exception_resolution_rule";
  text: string;
  value?: string | number | boolean | Record<string, unknown>;
  scope?: string;
  source?: string;
};

export type FinanceBelief = {
  id: string;
  tenantId: string;
  namespace: "finance";
  key: FinanceBeliefInput["key"];
  text: string;
  value: FinanceBeliefInput["value"] | null;
  status: MemoryStatus;
  scope: string | null;
  source: string | null;
  runId: string | null;
  supersedes: string | null;
  replacedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceTimelineEvent = FinanceBelief;

export type ReconciliationMismatch = {
  id: string;
  tenantId: string;
  runId: string;
  type: MismatchType;
  status: MismatchStatus;
  severity: "low" | "medium" | "high";
  entityType: "invoice" | "payment" | "sync";
  entityKey: string;
  providerPair: [ProviderName, ProviderName];
  summary: string;
  details: Record<string, unknown>;
  suggestedAction: string;
  createdAt: string;
  updatedAt: string;
};

export type ReconciliationResolution = {
  id: string;
  tenantId: string;
  mismatchId: string;
  runId: string;
  action: ResolutionAction;
  notes: string | null;
  actorRole: ServiceRole;
  createdAt: string;
};

export type ReconciliationRun = {
  id: string;
  tenantId: string;
  status: "running" | "completed";
  providers: ProviderName[];
  startedBy: string;
  idempotencyKey: string | null;
  startedAt: string;
  completedAt: string | null;
  summary: {
    matches: number;
    mismatches: number;
    dataFreshnessWarnings: number;
  };
  contextSnapshot: string[];
};

export type ReconciliationEvaluation = {
  run: ReconciliationRun;
  mismatches: ReconciliationMismatch[];
};

export type ReconciliationRunRequest = {
  tenantId: string;
  startedBy: string;
  actorRole: ServiceRole;
  providers?: ProviderName[];
  idempotencyKey?: string;
};

export type ResolveMismatchInput = {
  tenantId: string;
  mismatchId: string;
  action: ResolutionAction;
  notes?: string;
  actorRole: ServiceRole;
};

export type AuditEvent = {
  id: string;
  tenantId: string;
  service:
    | "gateway"
    | "connector"
    | "reconciliation"
    | "finance-memory"
    | "workflow"
    | "audit";
  action: string;
  actorRole: ServiceRole | "system";
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ProviderDelta = {
  provider: ProviderName;
  tenantId: string;
  sinceCursor: string;
  invoices: CanonicalInvoice[];
  payments: CanonicalPayment[];
  journalEntries: CanonicalJournalEntry[];
};

export type ProviderWebhookResult = {
  accepted: boolean;
  reason?: string;
  hint?: {
    entity: string;
    externalId: string | null;
  };
};

export type ProviderAdapter = {
  connectTenant(input: ConnectorConnectionRequest): Promise<ConnectorConnectionRecord>;
  refreshConnection(connection: ConnectorConnectionRecord): Promise<ConnectorConnectionRecord>;
  syncAccounts(connection: ConnectorConnectionRecord): Promise<CanonicalAccount[]>;
  syncInvoices(connection: ConnectorConnectionRecord): Promise<CanonicalInvoice[]>;
  syncPayments(connection: ConnectorConnectionRecord): Promise<CanonicalPayment[]>;
  syncJournalEntries(connection: ConnectorConnectionRecord): Promise<CanonicalJournalEntry[]>;
  syncCustomers(connection: ConnectorConnectionRecord): Promise<CanonicalCustomer[]>;
  syncVendors(connection: ConnectorConnectionRecord): Promise<CanonicalVendor[]>;
  fetchDelta(connection: ConnectorConnectionRecord, sinceCheckpoint: string): Promise<ProviderDelta>;
  handleWebhook(connection: ConnectorConnectionRecord, event: Record<string, unknown>): Promise<ProviderWebhookResult>;
};
