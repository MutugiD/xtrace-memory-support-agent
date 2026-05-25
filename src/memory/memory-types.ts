import type { Memory, MemoryRef, Message, Role } from "@xtraceai/memory";

export type ConversationMessage = {
  role: Role;
  content: string;
  date?: string;
};

export type MemoryCandidate = {
  ref: MemoryRef;
  hydrated?: Memory;
};

export type MemoryWriteResult = {
  jobId: string;
  created: MemoryRef[];
  updated: MemoryRef[];
  supersededBy: Record<string, string>;
  stageTimings?: Record<string, number>;
};

export function toXtraceMessages(messages: ConversationMessage[]): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    date: m.date
  }));
}

