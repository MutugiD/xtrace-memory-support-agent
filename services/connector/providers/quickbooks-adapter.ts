import fs from "node:fs";
import path from "node:path";
import type {
  CanonicalAccount,
  CanonicalCustomer,
  CanonicalInvoice,
  CanonicalJournalEntry,
  CanonicalPayment,
  CanonicalVendor,
  ConnectorConnectionRecord,
  ConnectorConnectionRequest,
  ProviderAdapter,
  ProviderDelta,
  ProviderWebhookResult
} from "../../shared/types.js";

type QuickBooksFixture = {
  accounts: Array<Record<string, any>>;
  invoices: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  journalEntries: Array<Record<string, any>>;
  customers: Array<Record<string, any>>;
  vendors: Array<Record<string, any>>;
};

function defaultFixturePath(): string {
  return path.join(process.cwd(), "services", "connector", "fixtures", "quickbooks-sandbox.json");
}

function loadFixture(connection: ConnectorConnectionRecord): QuickBooksFixture {
  const fixturePath = connection.fixturePath || defaultFixturePath();
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as QuickBooksFixture;
}

function toInvoice(tenantId: string, invoice: Record<string, any>): CanonicalInvoice {
  return {
    id: `quickbooks:${invoice.Id}`,
    tenantId,
    provider: "quickbooks",
    externalId: String(invoice.Id),
    invoiceNumber: String(invoice.DocNumber),
    customerName: String(invoice.CustomerRef?.name ?? "Unknown customer"),
    amount: Number(invoice.TotalAmt ?? 0),
    balance: Number(invoice.Balance ?? 0),
    currency: String(invoice.CurrencyRef?.value ?? "USD"),
    issuedAt: String(invoice.TxnDate),
    dueAt: invoice.DueDate ? String(invoice.DueDate) : null,
    status: Number(invoice.Balance ?? 0) === 0 ? "paid" : "open",
    updatedAt: String(invoice.MetaData?.LastUpdatedTime ?? new Date().toISOString())
  };
}

function toPayment(tenantId: string, payment: Record<string, any>): CanonicalPayment {
  const invoiceNumbers = Array.isArray(payment.Line)
    ? payment.Line.flatMap((line: any) => Array.isArray(line.LinkedTxn) ? line.LinkedTxn.map((txn: any) => String(txn.TxnId)) : [])
    : [];
  return {
    id: `quickbooks:${payment.Id}`,
    tenantId,
    provider: "quickbooks",
    externalId: String(payment.Id),
    invoiceNumbers,
    amount: Number(payment.TotalAmt ?? 0),
    currency: "USD",
    paidAt: String(payment.TxnDate),
    reference: String(payment.PaymentRefNum ?? payment.Id),
    updatedAt: String(payment.MetaData?.LastUpdatedTime ?? new Date().toISOString())
  };
}

function toAccount(tenantId: string, account: Record<string, any>): CanonicalAccount {
  return {
    id: `quickbooks:${account.Id}`,
    tenantId,
    provider: "quickbooks",
    externalId: String(account.Id),
    code: String(account.AcctNum ?? account.Id),
    name: String(account.Name),
    type: String(account.AccountType ?? "unknown"),
    updatedAt: String(account.MetaData?.LastUpdatedTime ?? new Date().toISOString())
  };
}

function toJournalEntry(tenantId: string, entry: Record<string, any>): CanonicalJournalEntry {
  return {
    id: `quickbooks:${entry.Id}`,
    tenantId,
    provider: "quickbooks",
    externalId: String(entry.Id),
    reference: String(entry.DocNumber ?? entry.Id),
    amount: Number(entry.TotalAmt ?? 0),
    currency: String(entry.CurrencyRef?.value ?? "USD"),
    postedAt: String(entry.TxnDate),
    updatedAt: String(entry.MetaData?.LastUpdatedTime ?? new Date().toISOString())
  };
}

function toCustomer(tenantId: string, customer: Record<string, any>): CanonicalCustomer {
  return {
    id: `quickbooks:${customer.Id}`,
    tenantId,
    provider: "quickbooks",
    externalId: String(customer.Id),
    displayName: String(customer.DisplayName),
    email: customer.PrimaryEmailAddr?.Address ? String(customer.PrimaryEmailAddr.Address) : null,
    updatedAt: String(customer.MetaData?.LastUpdatedTime ?? new Date().toISOString())
  };
}

function toVendor(tenantId: string, vendor: Record<string, any>): CanonicalVendor {
  return {
    id: `quickbooks:${vendor.Id}`,
    tenantId,
    provider: "quickbooks",
    externalId: String(vendor.Id),
    displayName: String(vendor.DisplayName),
    email: vendor.PrimaryEmailAddr?.Address ? String(vendor.PrimaryEmailAddr.Address) : null,
    updatedAt: String(vendor.MetaData?.LastUpdatedTime ?? new Date().toISOString())
  };
}

export class QuickBooksAdapter implements ProviderAdapter {
  async connectTenant(input: ConnectorConnectionRequest): Promise<ConnectorConnectionRecord> {
    return {
      id: `qb-connection-${input.tenantId}`,
      tenantId: input.tenantId,
      provider: "quickbooks",
      mode: input.mode ?? "sandbox",
      fixturePath: input.fixturePath ?? defaultFixturePath(),
      encryptedCredentials: "",
      connectedBy: input.connectedBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRefreshedAt: null
    };
  }

  async refreshConnection(connection: ConnectorConnectionRecord): Promise<ConnectorConnectionRecord> {
    return {
      ...connection,
      lastRefreshedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async syncAccounts(connection: ConnectorConnectionRecord): Promise<CanonicalAccount[]> {
    return loadFixture(connection).accounts.map((account) => toAccount(connection.tenantId, account));
  }

  async syncInvoices(connection: ConnectorConnectionRecord): Promise<CanonicalInvoice[]> {
    return loadFixture(connection).invoices.map((invoice) => toInvoice(connection.tenantId, invoice));
  }

  async syncPayments(connection: ConnectorConnectionRecord): Promise<CanonicalPayment[]> {
    return loadFixture(connection).payments.map((payment) => toPayment(connection.tenantId, payment));
  }

  async syncJournalEntries(connection: ConnectorConnectionRecord): Promise<CanonicalJournalEntry[]> {
    return loadFixture(connection).journalEntries.map((entry) => toJournalEntry(connection.tenantId, entry));
  }

  async syncCustomers(connection: ConnectorConnectionRecord): Promise<CanonicalCustomer[]> {
    return loadFixture(connection).customers.map((customer) => toCustomer(connection.tenantId, customer));
  }

  async syncVendors(connection: ConnectorConnectionRecord): Promise<CanonicalVendor[]> {
    return loadFixture(connection).vendors.map((vendor) => toVendor(connection.tenantId, vendor));
  }

  async fetchDelta(connection: ConnectorConnectionRecord, sinceCheckpoint: string): Promise<ProviderDelta> {
    const syncedInvoices = await this.syncInvoices(connection);
    const syncedPayments = await this.syncPayments(connection);
    const syncedJournalEntries = await this.syncJournalEntries(connection);
    const since = new Date(sinceCheckpoint).toISOString();
    return {
      provider: "quickbooks",
      tenantId: connection.tenantId,
      sinceCursor: since,
      invoices: syncedInvoices.filter((invoice) => invoice.updatedAt > since),
      payments: syncedPayments.filter((payment) => payment.updatedAt > since),
      journalEntries: syncedJournalEntries.filter((entry) => entry.updatedAt > since)
    };
  }

  async handleWebhook(_: ConnectorConnectionRecord, event: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const entity = String(event.entity ?? "unknown");
    const externalId = event.id ? String(event.id) : null;
    return {
      accepted: true,
      hint: {
        entity,
        externalId
      }
    };
  }
}
