import type { AgentMode } from "../agent/prompt-builder.js";
import { SupportAgent } from "../agent/support-agent.js";
import type { Env } from "../config.js";

export type DemoTurn = {
  session: string;
  userMessage: string;
  mode: AgentMode;
};

export const SUPPORT_DEMO_TURNS: DemoTurn[] = [
  {
    session: "session_001",
    mode: "with_memory",
    userMessage:
      "We are on the Pro plan. I prefer email updates. My main issue is invoice reconciliation. We currently use QuickBooks."
  },
  {
    session: "session_002",
    mode: "with_memory",
    userMessage: "Actually, we moved to Enterprise last week. Also don’t email me anymore, use Slack."
  },
  {
    session: "session_003",
    mode: "with_memory",
    userMessage: "Can you help with our invoice reconciliation setup?"
  },
  {
    session: "session_004",
    mode: "with_memory",
    userMessage: "One correction: we no longer use QuickBooks. We migrated to NetSuite."
  }
];

export async function runSupportDemo(env: Env, params: { userId: string }) {
  const agent = new SupportAgent(env);

  const results = [];
  for (const turn of SUPPORT_DEMO_TURNS) {
    const res = await agent.handleChatTurn({
      userId: params.userId,
      convId: turn.session,
      customerMessage: turn.userMessage,
      mode: turn.mode
    });
    results.push({ turn, res });
  }

  const stateless = await agent.handleChatTurn({
    userId: params.userId,
    convId: "session_003_stateless",
    customerMessage: SUPPORT_DEMO_TURNS[2]!.userMessage,
    mode: "stateless"
  });

  return { results, comparison: { stateless } };
}

