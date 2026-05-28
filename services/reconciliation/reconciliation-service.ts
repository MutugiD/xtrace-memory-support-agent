import crypto from "node:crypto";
import path from "node:path";
import { JsonFileStore } from "../shared/file-store.js";
import type {
  ProviderDataset,
  ProviderName,
  ReconciliationMismatch,
  ReconciliationResolution,
  ReconciliationRun,
  ResolutionAction,
  ServiceRole
} from "../shared/types.js";
import { evaluateReconciliation } from "./reconciliation-engine.js";

type ReconciliationState = {
  runs: ReconciliationRun[];
  mismatches: ReconciliationMismatch[];
  resolutions: ReconciliationResolution[];
  idempotency: Array<{ tenantId: string; key: string; runId: string }>;
};

export class ReconciliationService {
  private readonly store: JsonFileStore<ReconciliationState>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(path.join(dataDir, "reconciliation-state.json"), () => ({
      runs: [],
      mismatches: [],
      resolutions: [],
      idempotency: []
    }));
  }

  async evaluate(params: {
    tenantId: string;
    providers: ProviderName[];
    datasets: Record<ProviderName, ProviderDataset>;
    contextBeliefs: import("../shared/types.js").FinanceBelief[];
    startedBy: string;
    idempotencyKey?: string;
  }) {
    if (params.idempotencyKey) {
      const state = await this.store.load();
      const existing = state.idempotency.find(
        (entry) => entry.tenantId === params.tenantId && entry.key === params.idempotencyKey
      );
      if (existing) {
        const run = state.runs.find((candidate) => candidate.id === existing.runId);
        if (run) {
          return {
            run,
            mismatches: state.mismatches.filter((mismatch) => mismatch.runId === run.id)
          };
        }
      }
    }

    const evaluation = evaluateReconciliation(params);

    await this.store.update((state) => {
      state.runs.push(evaluation.run);
      state.mismatches.push(...evaluation.mismatches);
      if (params.idempotencyKey) {
        state.idempotency.push({
          tenantId: params.tenantId,
          key: params.idempotencyKey,
          runId: evaluation.run.id
        });
      }
      return null;
    });

    return evaluation;
  }

  async listRuns(tenantId: string): Promise<ReconciliationRun[]> {
    const state = await this.store.load();
    return state.runs
      .filter((run) => run.tenantId === tenantId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async getRun(tenantId: string, runId: string): Promise<ReconciliationRun | null> {
    const state = await this.store.load();
    return state.runs.find((run) => run.tenantId === tenantId && run.id === runId) ?? null;
  }

  async listMismatches(tenantId: string, runId: string): Promise<ReconciliationMismatch[]> {
    const state = await this.store.load();
    return state.mismatches.filter((mismatch) => mismatch.tenantId === tenantId && mismatch.runId === runId);
  }

  async resolveMismatch(params: {
    tenantId: string;
    mismatchId: string;
    action: ResolutionAction;
    notes?: string;
    actorRole: ServiceRole;
  }): Promise<ReconciliationResolution> {
    const now = new Date().toISOString();
    const resolution: ReconciliationResolution = {
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      mismatchId: params.mismatchId,
      runId: "",
      action: params.action,
      notes: params.notes ?? null,
      actorRole: params.actorRole,
      createdAt: now
    };

    await this.store.update((state) => {
      const mismatch = state.mismatches.find(
        (candidate) => candidate.tenantId === params.tenantId && candidate.id === params.mismatchId
      );
      if (!mismatch) throw new Error(`Mismatch ${params.mismatchId} not found for tenant ${params.tenantId}.`);
      mismatch.status = "resolved";
      mismatch.updatedAt = now;
      resolution.runId = mismatch.runId;
      state.resolutions.push(resolution);
      return null;
    });

    return resolution;
  }

  async listResolutions(tenantId: string): Promise<ReconciliationResolution[]> {
    const state = await this.store.load();
    return state.resolutions.filter((resolution) => resolution.tenantId === tenantId);
  }

  async exportReport(tenantId: string, runId: string) {
    const run = await this.getRun(tenantId, runId);
    if (!run) throw new Error(`Run ${runId} not found for tenant ${tenantId}.`);
    const mismatches = await this.listMismatches(tenantId, runId);
    const resolutions = (await this.listResolutions(tenantId)).filter((resolution) => resolution.runId === runId);
    return {
      run,
      mismatches,
      resolutions
    };
  }
}
