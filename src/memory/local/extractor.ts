import type { Role } from "@xtraceai/memory";

export type FactCandidate = {
  factKey: string;
  text: string;
  sourceRole: Role;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shouldRetract(userText: string): boolean {
  return /\b(ignore|that's wrong|that is wrong|no longer true|not true|forget that)\b/i.test(userText);
}

export function extractFactCandidatesFromUserText(userText: string): FactCandidate[] {
  const t = userText.trim();
  const lower = t.toLowerCase();
  const out: FactCandidate[] = [];

  const planMatch = lower.match(/\b(pro|enterprise|starter|business)\b/);
  if (planMatch) {
    out.push({
      factKey: "customer.plan",
      text: `Customer plan is ${capitalize(planMatch[1])}.`,
      sourceRole: "user"
    });
  }

  if (/\b(slack)\b/.test(lower)) {
    out.push({
      factKey: "customer.contact_preference",
      text: "Preferred contact channel is Slack.",
      sourceRole: "user"
    });
  } else if (/\b(email)\b/.test(lower)) {
    out.push({
      factKey: "customer.contact_preference",
      text: "Preferred contact channel is email.",
      sourceRole: "user"
    });
  } else if (/\b(sms|text message|text)\b/.test(lower)) {
    out.push({
      factKey: "customer.contact_preference",
      text: "Preferred contact channel is SMS.",
      sourceRole: "user"
    });
  } else if (/\b(phone|call)\b/.test(lower)) {
    out.push({
      factKey: "customer.contact_preference",
      text: "Preferred contact channel is phone.",
      sourceRole: "user"
    });
  }

  if (lower.includes("invoice") || lower.includes("reconciliation")) {
    out.push({
      factKey: "customer.issue",
      text: "Primary issue is invoice reconciliation.",
      sourceRole: "user"
    });
  }

  if (/\bquickbooks\b/.test(lower)) {
    out.push({
      factKey: "customer.accounting_system",
      text: "Accounting system is QuickBooks.",
      sourceRole: "user"
    });
  }
  if (/\bnetsuite\b/.test(lower)) {
    out.push({
      factKey: "customer.accounting_system",
      text: "Accounting system is NetSuite.",
      sourceRole: "user"
    });
  }
  if (/\bxero\b/.test(lower)) {
    out.push({
      factKey: "customer.accounting_system",
      text: "Accounting system is Xero.",
      sourceRole: "user"
    });
  }

  // Dedupe: keep the most recent candidate per factKey.
  const byKey = new Map<string, FactCandidate>();
  for (const c of out) byKey.set(c.factKey, c);
  return [...byKey.values()];
}

