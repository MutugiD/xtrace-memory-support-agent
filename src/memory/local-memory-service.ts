import crypto from "node:crypto";
import type { Memory, MemoryRef } from "@xtraceai/memory";
import type { ConversationMessage, MemoryWriteResult } from "./memory-types.js";
import { computeRichTimeline, computeTimelineFromFacts, type TimelineEvent } from "./memory-service.js";
import { LocalDb } from "./local/db.js";
import { extractFactCandidatesFromUserText, shouldRetract } from "./local/extractor.js";
import { buildContextPrompt, rankActiveFactsForQuery } from "./local/retrieval.js";
import { rowToMemory, type MemoryRow } from "./local/convert.js";

function isoNow(): string {
  return new Date().toISOString();
}

type LocalMemoryServiceOptions = {
  appId: string;
  dbPath: string;
};

export class LocalMemoryService {
  private readonly appId: string;
  private readonly db: LocalDb;

  constructor(opts: LocalMemoryServiceOptions) {
    this.appId = opts.appId;
    this.db = new LocalDb(opts.dbPath);
  }

  private async selectRows(sql: string, bind: Array<string | number | null>): Promise<MemoryRow[]> {
    const db = await this.db.getDb();
    const stmt = db.prepare(sql);
    stmt.bind(bind);
    const rows: MemoryRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as any);
    stmt.free();
    return rows;
  }

  private async run(sql: string, bind: Array<string | number | null>) {
    const db = await this.db.getDb();
    const stmt = db.prepare(sql);
    stmt.run(bind);
    stmt.free();
    this.db.persist(db);
  }

  async ingestTurn(params: {
    userId: string;
    convId: string;
    messages: ConversationMessage[];
    metadata?: Record<string, unknown>;
    extractArtifacts?: boolean;
  }): Promise<MemoryWriteResult> {
    const db = await this.db.getDb();
    const userText = params.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const candidates = extractFactCandidatesFromUserText(userText);
    const doRetract = shouldRetract(userText);

    const created: MemoryRef[] = [];
    const updated: MemoryRef[] = [];
    const supersededBy: Record<string, string> = {};

    const now = isoNow();
    const metadataJson = JSON.stringify(params.metadata ?? {});

    db.exec("BEGIN TRANSACTION;");
    try {
      for (const c of candidates) {
        const activeStmt = db.prepare(
          `SELECT * FROM memories
           WHERE user_id = ? AND app_id = ? AND type = 'fact' AND fact_key = ? AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`
        );
        activeStmt.bind([params.userId, this.appId, c.factKey]);
        const prevRow = activeStmt.step() ? (activeStmt.getAsObject() as any) : null;
        activeStmt.free();

        if (doRetract && prevRow) {
          const retractStmt = db.prepare(`UPDATE memories SET status = 'retracted', updated_at = ? WHERE id = ?`);
          retractStmt.run([now, prevRow.id]);
          retractStmt.free();
          continue;
        }

        if (prevRow && String(prevRow.text) === c.text) continue;

        const id = crypto.randomUUID();
        const supersedes = prevRow ? String(prevRow.id) : null;

        const insertStmt = db.prepare(
          `INSERT INTO memories
           (id, type, user_id, conv_id, app_id, text, status, supersedes, fact_key, source_role, metadata_json, created_at, updated_at)
           VALUES (?, 'fact', ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
        );
        insertStmt.run([
          id,
          params.userId,
          params.convId,
          this.appId,
          c.text,
          supersedes,
          c.factKey,
          c.sourceRole,
          metadataJson,
          now,
          now
        ]);
        insertStmt.free();

        created.push({ id, type: "fact", text: c.text });

        if (supersedes) {
          const supStmt = db.prepare(`UPDATE memories SET status = 'superseded', updated_at = ? WHERE id = ?`);
          supStmt.run([now, supersedes]);
          supStmt.free();
          supersededBy[supersedes] = id;
        }
      }

      db.exec("COMMIT;");
    } catch (e) {
      db.exec("ROLLBACK;");
      throw e;
    } finally {
      this.db.persist(db);
    }

    return {
      jobId: `local_job_${crypto.randomUUID()}`,
      created,
      updated,
      supersededBy,
      stageTimings: { local_total_ms: 1 }
    };
  }

  async retrieveContext(params: {
    userId: string;
    convId: string;
    query: string;
  }): Promise<{ contextPrompt: string | null; memories: Memory[]; stageTimings?: Record<string, number> }> {
    const rows = await this.selectRows(
      `SELECT * FROM memories
       WHERE user_id = ? AND app_id = ? AND type = 'fact' AND status = 'active'
       ORDER BY created_at DESC`,
      [params.userId, this.appId]
    );
    const active = rows.map(rowToMemory);
    const ranked = rankActiveFactsForQuery(active, params.query).slice(0, 12);
    return { contextPrompt: buildContextPrompt(ranked), memories: ranked, stageTimings: { local_retrieve_ms: 1 } };
  }

  async listFacts(params: { userId: string; includeSuperseded: boolean }): Promise<Memory[]> {
    const statusClause = params.includeSuperseded ? "" : "AND status = 'active'";
    const rows = await this.selectRows(
      `SELECT * FROM memories
       WHERE user_id = ? AND app_id = ? AND type = 'fact' ${statusClause}
       ORDER BY created_at ASC`,
      [params.userId, this.appId]
    );
    return rows.map(rowToMemory);
  }

  async listMemoriesByType(params: { userId: string; type: "fact" | "episode" | "artifact" }): Promise<Memory[]> {
    if (params.type !== "fact") return [];
    return this.listFacts({ userId: params.userId, includeSuperseded: true });
  }

  async listAllMemories(params: { userId: string }): Promise<Memory[]> {
    return this.listFacts({ userId: params.userId, includeSuperseded: true });
  }

  async getMemoryById(memoryId: string): Promise<Memory> {
    const rows = await this.selectRows(`SELECT * FROM memories WHERE id = ? AND app_id = ? LIMIT 1`, [
      memoryId,
      this.appId
    ]);
    if (!rows.length) throw new Error(`Memory not found: ${memoryId}`);
    return rowToMemory(rows[0]!);
  }

  async buildTimeline(params: { userId: string }): Promise<TimelineEvent[]> {
    const allFacts = await this.listFacts({ userId: params.userId, includeSuperseded: true });
    return computeTimelineFromFacts(allFacts);
  }

  async buildRichTimeline(params: { userId: string }): Promise<TimelineEvent[]> {
    const all = await this.listAllMemories({ userId: params.userId });
    return computeRichTimeline(all);
  }

  async resetUser(params: { userId: string }): Promise<{ deleted: number }> {
    const rows = await this.selectRows(`SELECT id FROM memories WHERE user_id = ? AND app_id = ?`, [
      params.userId,
      this.appId
    ]);
    await this.run(`DELETE FROM memories WHERE user_id = ? AND app_id = ?`, [params.userId, this.appId]);
    return { deleted: rows.length };
  }
}
