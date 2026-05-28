import type {
  ConnectorConnectionRecord,
  ConnectorConnectionRequest,
  ProviderAdapter,
  ProviderDataset,
  ProviderName
} from "../shared/types.js";
import { ConnectorCredentialStore } from "./credential-store.js";
import { QuickBooksAdapter } from "./providers/quickbooks-adapter.js";
import { ZohoAdapter } from "./providers/zoho-adapter.js";

export class ConnectorService {
  private readonly store: ConnectorCredentialStore;
  private readonly adapters: Record<ProviderName, ProviderAdapter>;

  constructor(
    dataDir: string,
    secret: string
  ) {
    this.store = new ConnectorCredentialStore(dataDir, secret);
    this.adapters = {
      quickbooks: new QuickBooksAdapter(),
      zoho: new ZohoAdapter()
    };
  }

  private adapter(provider: ProviderName): ProviderAdapter {
    return this.adapters[provider];
  }

  async connectTenant(input: ConnectorConnectionRequest): Promise<ConnectorConnectionRecord> {
    const provisional = await this.adapter(input.provider).connectTenant(input);
    const saved = await this.store.saveConnection({
      ...input,
      fixturePath: input.fixturePath ?? provisional.fixturePath ?? undefined
    });
    return saved;
  }

  async refreshConnection(tenantId: string, provider: ProviderName): Promise<ConnectorConnectionRecord> {
    const current = await this.requireConnection(tenantId, provider);
    const refreshed = await this.adapter(provider).refreshConnection(current);
    return this.store.updateConnection(refreshed);
  }

  async listConnections(tenantId: string): Promise<ConnectorConnectionRecord[]> {
    return this.store.listConnections(tenantId);
  }

  async syncTenantData(tenantId: string, provider: ProviderName): Promise<ProviderDataset> {
    const connection = await this.requireConnection(tenantId, provider);
    const adapter = this.adapter(provider);
    const [accounts, invoices, payments, journalEntries, customers, vendors] = await Promise.all([
      adapter.syncAccounts(connection),
      adapter.syncInvoices(connection),
      adapter.syncPayments(connection),
      adapter.syncJournalEntries(connection),
      adapter.syncCustomers(connection),
      adapter.syncVendors(connection)
    ]);
    const syncedAt = new Date().toISOString();
    return {
      provider,
      tenantId,
      syncedAt,
      accounts,
      invoices,
      payments,
      journalEntries,
      customers,
      vendors,
      checkpoints: [
        { provider, entity: "accounts", cursor: syncedAt, syncedAt },
        { provider, entity: "invoices", cursor: syncedAt, syncedAt },
        { provider, entity: "payments", cursor: syncedAt, syncedAt },
        { provider, entity: "journalEntries", cursor: syncedAt, syncedAt },
        { provider, entity: "customers", cursor: syncedAt, syncedAt },
        { provider, entity: "vendors", cursor: syncedAt, syncedAt }
      ],
      rawSummary: {
        source: connection.mode,
        recordsRead:
          accounts.length +
          invoices.length +
          payments.length +
          journalEntries.length +
          customers.length +
          vendors.length
      }
    };
  }

  async fetchDelta(tenantId: string, provider: ProviderName, sinceCheckpoint: string) {
    const connection = await this.requireConnection(tenantId, provider);
    return this.adapter(provider).fetchDelta(connection, sinceCheckpoint);
  }

  async handleWebhook(tenantId: string, provider: ProviderName, event: Record<string, unknown>) {
    const connection = await this.requireConnection(tenantId, provider);
    return this.adapter(provider).handleWebhook(connection, event);
  }

  async requireConnection(tenantId: string, provider: ProviderName): Promise<ConnectorConnectionRecord> {
    const connection = await this.store.getConnection(tenantId, provider);
    if (!connection) throw new Error(`No ${provider} connection configured for tenant ${tenantId}.`);
    return connection;
  }
}
