import crypto from "node:crypto";
import path from "node:path";
import { JsonFileStore } from "../shared/file-store.js";
import { decryptJson, encryptJson } from "../shared/security.js";
import type { ConnectorConnectionRecord, ConnectorConnectionRequest } from "../shared/types.js";

type CredentialStoreState = {
  connections: ConnectorConnectionRecord[];
};

function isoNow(): string {
  return new Date().toISOString();
}

export class ConnectorCredentialStore {
  private readonly store: JsonFileStore<CredentialStoreState>;

  constructor(
    dataDir: string,
    private readonly secret: string
  ) {
    this.store = new JsonFileStore(path.join(dataDir, "connector-connections.json"), () => ({
      connections: []
    }));
  }

  async saveConnection(input: ConnectorConnectionRequest): Promise<ConnectorConnectionRecord> {
    const now = isoNow();
    const record: ConnectorConnectionRecord = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      provider: input.provider,
      mode: input.mode ?? "sandbox",
      fixturePath: input.fixturePath ?? null,
      encryptedCredentials: encryptJson(input.credentials ?? {}, this.secret),
      connectedBy: input.connectedBy,
      createdAt: now,
      updatedAt: now,
      lastRefreshedAt: null
    };

    await this.store.update((state) => {
      state.connections = state.connections.filter(
        (existing) => !(existing.tenantId === input.tenantId && existing.provider === input.provider)
      );
      state.connections.push(record);
      return null;
    });

    return record;
  }

  async updateConnection(record: ConnectorConnectionRecord): Promise<ConnectorConnectionRecord> {
    const updated: ConnectorConnectionRecord = {
      ...record,
      updatedAt: isoNow(),
      lastRefreshedAt: isoNow()
    };

    await this.store.update((state) => {
      state.connections = state.connections.map((existing) => (existing.id === updated.id ? updated : existing));
      return null;
    });

    return updated;
  }

  async getConnection(tenantId: string, provider: ConnectorConnectionRecord["provider"]): Promise<ConnectorConnectionRecord | null> {
    const state = await this.store.load();
    return state.connections.find((connection) => connection.tenantId === tenantId && connection.provider === provider) ?? null;
  }

  async listConnections(tenantId: string): Promise<ConnectorConnectionRecord[]> {
    const state = await this.store.load();
    return state.connections.filter((connection) => connection.tenantId === tenantId);
  }

  readCredentials(record: ConnectorConnectionRecord): Record<string, string> {
    return decryptJson<Record<string, string>>(record.encryptedCredentials, this.secret);
  }
}
