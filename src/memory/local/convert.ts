import type { Memory, MemoryStatus, Role } from "@xtraceai/memory";

export type MemoryRow = {
  id: string;
  type: string;
  user_id: string;
  conv_id: string;
  app_id: string;
  text: string;
  status: string;
  supersedes: string | null;
  fact_key: string | null;
  source_role: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export function rowToMemory(row: MemoryRow): Memory {
  const details = {
    fact_type: "local",
    status: row.status as MemoryStatus,
    supersedes: row.supersedes,
    source_role: row.source_role as Role,
    // keep compatibility with the SDK Memory shape
    episode_id: null,
    artifact_id: null,
    artifact_ids: [],
    source_event_ids: [],
    // local-only: store fact_key in details for ranking/debugging
    fact_key: row.fact_key
  };

  return {
    id: row.id,
    object: "memory",
    type: row.type as any,
    text: row.text,
    user_id: row.user_id,
    agent_id: null,
    conv_id: row.conv_id,
    app_id: row.app_id,
    metadata: JSON.parse(row.metadata_json ?? "{}"),
    categories: [],
    score: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    details
  } as any;
}

