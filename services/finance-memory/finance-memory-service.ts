import crypto from "node:crypto";
import path from "node:path";
import { JsonFileStore } from "../shared/file-store.js";
import type { FinanceBelief, FinanceBeliefInput, FinanceTimelineEvent } from "../shared/types.js";

type FinanceMemoryState = {
  beliefs: FinanceBelief[];
};

function isoNow(): string {
  return new Date().toISOString();
}

function valuesEqual(a: FinanceBelief["value"], b: FinanceBeliefInput["value"]): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export class FinanceMemoryService {
  private readonly store: JsonFileStore<FinanceMemoryState>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(path.join(dataDir, "finance-memory.json"), () => ({
      beliefs: []
    }));
  }

  async recordBeliefs(params: {
    tenantId: string;
    runId?: string;
    source?: string;
    beliefs: FinanceBeliefInput[];
  }): Promise<{ created: FinanceBelief[]; superseded: Record<string, string> }> {
    const created: FinanceBelief[] = [];
    const superseded: Record<string, string> = {};
    const now = isoNow();

    await this.store.update((state) => {
      for (const beliefInput of params.beliefs) {
        const current = state.beliefs
          .filter(
            (belief) =>
              belief.tenantId === params.tenantId &&
              belief.key === beliefInput.key &&
              belief.scope === (beliefInput.scope ?? null) &&
              belief.status === "active"
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

        if (current && current.text === beliefInput.text && valuesEqual(current.value, beliefInput.value)) {
          continue;
        }

        const nextId = crypto.randomUUID();
        const nextBelief: FinanceBelief = {
          id: nextId,
          tenantId: params.tenantId,
          namespace: "finance",
          key: beliefInput.key,
          text: beliefInput.text,
          value: beliefInput.value ?? null,
          status: "active",
          scope: beliefInput.scope ?? null,
          source: beliefInput.source ?? params.source ?? null,
          runId: params.runId ?? null,
          supersedes: current?.id ?? null,
          replacedBy: null,
          createdAt: now,
          updatedAt: now
        };

        if (current) {
          current.status = "superseded";
          current.replacedBy = nextId;
          current.updatedAt = now;
          superseded[current.id] = nextId;
        }

        state.beliefs.push(nextBelief);
        created.push(nextBelief);
      }
      return null;
    });

    return { created, superseded };
  }

  async retractBelief(params: { tenantId: string; key: FinanceBelief["key"]; scope?: string; reason?: string }): Promise<number> {
    const now = isoNow();
    const { result } = await this.store.update((state) => {
      const active = state.beliefs.filter(
        (belief) =>
          belief.tenantId === params.tenantId &&
          belief.key === params.key &&
          belief.scope === (params.scope ?? null) &&
          belief.status === "active"
      );
      for (const belief of active) {
        belief.status = "retracted";
        belief.updatedAt = now;
        if (params.reason) {
          belief.source = params.reason;
        }
      }
      return active.length;
    });
    return result;
  }

  async retrieveContext(params: { tenantId: string; topic: string; scope?: string; limit?: number }) {
    const state = await this.store.load();
    const topicTokens = tokenize(params.topic);
    const limit = params.limit ?? 8;
    const active = state.beliefs.filter(
      (belief) =>
        belief.tenantId === params.tenantId &&
        belief.status === "active" &&
        (params.scope ? belief.scope === params.scope || belief.scope === null : true)
    );

    const ranked = active
      .map((belief) => ({ belief, score: scoreBelief(belief, topicTokens) }))
      .sort((a, b) => b.score - a.score || b.belief.updatedAt.localeCompare(a.belief.updatedAt))
      .slice(0, limit)
      .map((entry) => entry.belief);

    return {
      context: ranked.map((belief) => belief.text),
      beliefs: ranked
    };
  }

  async listTimeline(params: { tenantId: string; scope?: string }): Promise<FinanceTimelineEvent[]> {
    const state = await this.store.load();
    return state.beliefs
      .filter((belief) => belief.tenantId === params.tenantId && (!params.scope || belief.scope === params.scope || belief.scope === null))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listActiveBeliefs(params: { tenantId: string; scope?: string }): Promise<FinanceBelief[]> {
    const state = await this.store.load();
    return state.beliefs.filter(
      (belief) =>
        belief.tenantId === params.tenantId &&
        belief.status === "active" &&
        (!params.scope || belief.scope === params.scope || belief.scope === null)
    );
  }

  async resetTenant(tenantId: string): Promise<{ deleted: number }> {
    const { result } = await this.store.update((state) => {
      const count = state.beliefs.filter((belief) => belief.tenantId === tenantId).length;
      state.beliefs = state.beliefs.filter((belief) => belief.tenantId !== tenantId);
      return count;
    });
    return { deleted: result };
  }
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreBelief(belief: FinanceBelief, tokens: string[]): number {
  const haystack = `${belief.key} ${belief.text}`.toLowerCase();
  const overlap = tokens.reduce((count, token) => (haystack.includes(token) ? count + 1 : count), 0);
  const priorityBoost =
    belief.key === "tenant.reconciliation_tolerance" || belief.key === "tenant.exception_resolution_rule" ? 2 : 1;
  return overlap * priorityBoost;
}
