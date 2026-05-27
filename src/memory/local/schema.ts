import type { Database } from "sql.js";

export function ensureLocalSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      conv_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      supersedes TEXT,
      fact_key TEXT,
      source_role TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_user_app_status ON memories(user_id, app_id, status);
    CREATE INDEX IF NOT EXISTS idx_memories_user_app_fact_status ON memories(user_id, app_id, fact_key, status);
    CREATE INDEX IF NOT EXISTS idx_memories_user_app_created ON memories(user_id, app_id, created_at);
  `);
}

