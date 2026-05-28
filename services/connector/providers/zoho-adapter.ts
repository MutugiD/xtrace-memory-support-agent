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

type ZohoFixture = {
  chart_of_accounts: Array<Record<string, any>>;
  invoices: Array<Record<string, any>>;
  customer_payments: Array<Record<string, any>>;
  journals: Array<Record<string, any>>;
  contacts: Array<Record<string, any>>;
  vendors: Array<Record<string, any>>;
};

function defaultFixturePath(): string {
  return path.join(process.cwd(), "services", "connector", "fixtures", "zoho-sandbox.json");
}

function loadFixture(connection: ConnectorConnectionRecord): ZohoFixture {
  const fixturePath = connection.fixturePath || defaultFixturePath();
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as ZohoFixture;
}

function toInvoice(tenantId: string, invoice: Record<string, any>): CanonicalInvoice {
  return {
    id: `zoho:${invoice.invoice_id}`,
    tenantId,
    provider: "zoho",
    externalId: String(invoice.invoice_id),
    invoiceNumber: String(invoice.invoice_number),
    customerName: String(invoice.customer_name ?? "Unknown customer"),
    amount: Number(invoice.total ?? 0),
    balance: Number(invoice.balance ?? 0),
    currency: String(invoice.currency_code ?? "USD"),
    issuedAt: String(invoice.date),
    dueAt: invoice.due_date ? String(invoice.due_date) : null,
    status: Number(invoice.balance ?? 0) === 0 ? "paid" : "open",
    updatedAt: String(invoice.last_modified_time ?? new Date().toISOString())
  };
}

function toPayment(tenantId: string, payment: Record<string, any>): CanonicalPayment {
  return {
    id: `zoho:${payment.payment_id}`,
    tenantId,
    provider: "zoho",
    externalId: String(payment.payment_id),
    invoiceNumbers: Array.isArray(payment.invoice_numbers) ? payment.invoice_numbers.map((value: unknown) => String(value)) : [],
    amount: Number(payment.amount ?? 0),
    currency: String(payment.currency_code ?? "USD"),
    paidAt: String(payment.date),
    reference: String(payment.reference_number ?? payment.payment_id),
    updatedAt: String(payment.last_modified_time ?? new Date().toISOString())
  };
}

function toAccount(tenantId: string, account: Record<string, any>): CanonicalAccount {
  return {
    id: `zoho:${account.account_id}`,
    tenantId,
    provider: "zoho",
    externalId: String(account.account_id),
    code: String(account.account_code ?? account.account_id),
    name: String(account.account_name),
    type: String(account.account_type ?? "unknown"),
    updatedAt: String(account.last_modified_time ?? new Date().toISOString())
  };
}

function toJournalEntry(tenantId: string, journal: Record<string, any>): CanonicalJournalEntry {
  return {
    id: `zoho:${journal.journal_id}`,
    tenantId,
    provider: "zoho",
    externalId: String(journal.journal_id),
    reference: String(journal.reference_number ?? journal.journal_id),
    amount: Number(journal.total ?? 0),
    currency: String(journal.currency_code ?? "USD"),
    postedAt: String(journal.date),
    updatedAt: String(journal.last_modified_time ?? new Date().toISOString())
  };
}

function toCustomer(tenantId: string, customer: Record<string, any>): CanonicalCustomer {
  return {
    id: `zoho:${customer.contact_id}`,
    tenantId,
    provider: "zoho",
    externalId: String(customer.contact_id),
    displayName: String(customer.contact_name),
    email: customer.email ? String(customer.email) : null,
    updatedAt: String(customer.last_modified_time ?? new Date().toISOString())
  };
}

function toVendor(tenantId: string, vendor: Record<string, any>): CanonicalVendor {
  return {
    id: `zoho:${vendor.vendor_id}`,
    tenantId,
    provider: "zoho",
    externalId: String(vendor.vendor_id),
    displayName: String(vendor.vendor_name),
    email: vendor.email ? String(vendor.email) : null,
    updatedAt: String(vendor.last_modified_time ?? new Date().toISOString())
  };
}

export class ZohoAdapter implements ProviderAdapter {
  async connectTenant(input: ConnectorConnectionRequest): Promise<ConnectorConnectionRecord> {
    return {
      id: `zoho-connection-${input.tenantId}`,
      tenantId: input.tenantId,
      provider: "zoho",
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
    return loadFixture(connection).chart_of_accounts.map((account) => toAccount(connection.tenantId, account));
  }

  async syncInvoices(connection: ConnectorConnectionRecord): Promise<CanonicalInvoice[]> {
    return loadFixture(connection).invoices.map((invoice) => toInvoice(connection.tenantId, invoice));
  }

  async syncPayments(connection: ConnectorConnectionRecord): Promise<CanonicalPayment[]> {
    return loadFixture(connection).customer_payments.map((payment) => toPayment(connection.tenantId, payment));
  }

  async syncJournalEntries(connection: ConnectorConnectionRecord): Promise<CanonicalJournalEntry[]> {
    return loadFixture(connection).journals.map((journal) => toJournalEntry(connection.tenantId, journal));
  }

  async syncCustomers(connection: ConnectorConnectionRecord): Promise<CanonicalCustomer[]> {
    return loadFixture(connection).contacts.map((customer) => toCustomer(connection.tenantId, customer));
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
      provider: "zoho",
      tenantId: connection.tenantId,
      sinceCursor: since,
      invoices: syncedInvoices.filter((invoice) => invoice.updatedAt > since),
      payments: syncedPayments.filter((payment) => payment.updatedAt > since),
      journalEntries: syncedJournalEntries.filter((entry) => entry.updatedAt > since)
    };
  }

  async handleWebhook(_: ConnectorConnectionRecord, event: Record<string, unknown>): Promise<ProviderWebhookResult> {
    const entity = String(event.module ?? "unknown");
    const externalId = event.resource_id ? String(event.resource_id) : null;
    return {
      accepted: true,
      hint: {
        entity,
        externalId
      }
    };
  }
}
