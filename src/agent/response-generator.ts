import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Memory } from "@xtraceai/memory";
import type { Env } from "../config.js";
import type { AgentMode } from "./prompt-builder.js";

function pickFromMemories(memories: Memory[], includes: RegExp): string | null {
  for (const m of memories) {
    if (m.type !== "fact") continue;
    if (includes.test(m.text)) return m.text;
  }
  return null;
}

function deterministicReply(params: {
  mode: AgentMode;
  customerMessage: string;
  memoryContextPrompt: string | null;
  retrievedMemories: Memory[];
}): string {
  const { mode, retrievedMemories } = params;

  if (mode === "with_memory" && retrievedMemories.length > 0) {
    const plan = pickFromMemories(retrievedMemories, /\b(plan|enterprise|pro|starter)\b/i);
    const contact = pickFromMemories(retrievedMemories, /\b(slack|email|sms|phone)\b/i);
    const issue = pickFromMemories(retrievedMemories, /\b(invoice|reconciliation|billing|payment)\b/i);
    const accounting = pickFromMemories(retrievedMemories, /\b(quickbooks|netsuite|xero|sage)\b/i);

    const lines = [
      "Got it — I can help.",
      plan ? `What I have on file: ${plan}` : null,
      contact ? `Preferred updates channel: ${contact}` : null,
      accounting ? `Accounting system context: ${accounting}` : null,
      issue ? `Open thread: ${issue}` : null,
      "",
      "To get you unstuck quickly: can you share (1) the invoice source system, (2) where reconciliation is breaking (import, mapping, approvals, or export), and (3) whether you need a one-time backfill or an ongoing sync?"
    ].filter(Boolean);

    return lines.join("\n");
  }

  return [
    "Happy to help. To avoid guessing, a few quick questions:",
    "1) What plan are you on (Pro/Enterprise/etc.)?",
    "2) What's your preferred contact channel for updates (Slack/email/etc.)?",
    "3) What's the main issue you're trying to solve right now (e.g., invoice reconciliation)?",
    "4) Which accounting system are you using (QuickBooks/NetSuite/etc.)?"
  ].join("\n");
}

export async function generateSupportReply(
  env: Env,
  params: {
    mode: AgentMode;
    customerMessage: string;
    memoryContextPrompt: string | null;
    retrievedMemories: Memory[];
    llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }
): Promise<{ reply: string; usedLlm: boolean }> {
  if (env.OPENAI_API_KEY) {
    try {
      if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
      const result = await generateText({
        model: openai(env.OPENAI_MODEL),
        messages: params.llmMessages,
        temperature: 0.3
      });
      return { reply: result.text, usedLlm: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[warn] LLM unavailable; falling back to deterministic reply: ${message}`);
      return {
        reply: deterministicReply({
          mode: params.mode,
          customerMessage: params.customerMessage,
          memoryContextPrompt: params.memoryContextPrompt,
          retrievedMemories: params.retrievedMemories
        }),
        usedLlm: false
      };
    }
  }

  return {
    reply: deterministicReply({
      mode: params.mode,
      customerMessage: params.customerMessage,
      memoryContextPrompt: params.memoryContextPrompt,
      retrievedMemories: params.retrievedMemories
    }),
    usedLlm: false
  };
}
