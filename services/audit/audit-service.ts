import crypto from "node:crypto";
import path from "node:path";
import { JsonFileStore } from "../shared/file-store.js";
import { redactSensitive } from "../shared/redaction.js";
import type { AuditEvent, ServiceRole } from "../shared/types.js";

type AuditState = {
  events: AuditEvent[];
};

export class AuditService {
  private readonly store: JsonFileStore<AuditState>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(path.join(dataDir, "audit-events.json"), () => ({
      events: []
    }));
  }

  async record(params: {
    tenantId: string;
    service: AuditEvent["service"];
    action: string;
    actorRole: ServiceRole | "system";
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      service: params.service,
      action: params.action,
      actorRole: params.actorRole,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: redactSensitive(params.payload),
      createdAt: new Date().toISOString()
    };

    await this.store.update((state) => {
      state.events.push(event);
      return null;
    });

    return event;
  }

  async listTenantEvents(tenantId: string): Promise<AuditEvent[]> {
    const state = await this.store.load();
    return state.events
      .filter((event) => event.tenantId === tenantId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async buildReport(tenantId: string): Promise<{ tenantId: string; events: AuditEvent[] }> {
    return {
      tenantId,
      events: await this.listTenantEvents(tenantId)
    };
  }
}
