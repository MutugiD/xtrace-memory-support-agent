const $ = (id) => document.getElementById(id);

const userIdEl = $("userId");
const convIdEl = $("convId");
const modeEl = $("mode");
const messageEl = $("message");
const sendBtn = $("sendBtn");
const newSessionBtn = $("newSessionBtn");
const chatLog = $("chatLog");
const activeFactsEl = $("activeFacts");
const timelineEl = $("timeline");
const contextPromptEl = $("contextPrompt");
const writeResultEl = $("writeResult");
const runDemoBtn = $("runDemoBtn");
const resetDemoBtn = $("resetDemoBtn");

let sessionCounter = 1;

function appendChat(role, text) {
  const row = document.createElement("div");
  row.className = "mb-2";
  const badge =
    role === "user"
      ? `<span class="text-xs rounded bg-slate-800 px-2 py-0.5">Customer</span>`
      : `<span class="text-xs rounded bg-indigo-700 px-2 py-0.5">Agent</span>`;
  row.innerHTML = `${badge}<div class="mt-1 whitespace-pre-wrap text-slate-100">${escapeHtml(text)}</div>`;
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshMemoryPanels() {
  const userId = userIdEl.value.trim();
  if (!userId) return;

  const active = await fetch(`/api/memory/${encodeURIComponent(userId)}`).then((r) => r.json());
  const timeline = await fetch(`/api/memory/${encodeURIComponent(userId)}/timeline`).then((r) => r.json());

  activeFactsEl.innerHTML = renderFacts(active.facts ?? []);
  timelineEl.innerHTML = renderTimeline(timeline.timeline ?? []);
}

function renderFacts(facts) {
  if (!facts.length) return `<div class="text-slate-400">No active facts yet.</div>`;
  return `<ul class="space-y-2">${facts
    .map(
      (f) =>
        `<li class="rounded border border-slate-800 bg-slate-950 p-2">
          <div class="text-xs text-slate-400">${f.id} • ${f.created_at} • conv_id=${f.conv_id ?? "-"}</div>
          <div class="mt-1">${escapeHtml(f.text)}</div>
        </li>`
    )
    .join("")}</ul>`;
}

function renderTimeline(events) {
  if (!events.length) return `<div class="text-slate-400">No timeline yet.</div>`;
  return `<ul class="space-y-2">${events
    .map(
      (e) =>
        `<li class="rounded border border-slate-800 bg-slate-950 p-2">
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>${escapeHtml(e.id)}</span>
            <span>•</span>
            <span>${escapeHtml(e.createdAt)}</span>
            <span>•</span>
            <span>status=${escapeHtml(e.status ?? "unknown")}</span>
          </div>
          <div class="mt-1">${escapeHtml(e.text)}</div>
          <div class="mt-2 text-xs text-slate-400">
            supersedes=${escapeHtml(e.supersedes ?? "-")} • replaced_by=${escapeHtml(e.replacedBy ?? "-")}
          </div>
        </li>`
    )
    .join("")}</ul>`;
}

async function sendMessage() {
  const userId = userIdEl.value.trim();
  const convId = convIdEl.value.trim();
  const mode = modeEl.value;
  const message = messageEl.value.trim();
  if (!userId || !convId || !message) return;

  appendChat("user", message);
  messageEl.value = "";

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, convId, message, mode })
  }).then((r) => r.json());

  if (res.error) {
    appendChat("assistant", `Error: ${JSON.stringify(res.error, null, 2)}`);
    return;
  }

  contextPromptEl.textContent = res.retrievedContextPrompt ?? "";
  writeResultEl.textContent = JSON.stringify(res.writeResult ?? {}, null, 2);
  appendChat("assistant", res.reply);

  await refreshMemoryPanels();
}

function bumpSession() {
  sessionCounter += 1;
  convIdEl.value = `session_${String(sessionCounter).padStart(3, "0")}`;
}

sendBtn.addEventListener("click", () => void sendMessage());
messageEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void sendMessage();
});
newSessionBtn.addEventListener("click", bumpSession);

runDemoBtn.addEventListener("click", async () => {
  const userId = userIdEl.value.trim() || "customer_123";
  const report = await fetch("/api/demo/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  }).then((r) => r.json());
  appendChat("assistant", `Scripted demo finished.\n\n${JSON.stringify(report, null, 2)}`);
  await refreshMemoryPanels();
});

resetDemoBtn.addEventListener("click", async () => {
  const userId = userIdEl.value.trim() || "customer_123";
  const res = await fetch(`/api/demo/reset?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }).then((r) =>
    r.json()
  );
  appendChat("assistant", `Reset: ${JSON.stringify(res, null, 2)}`);
  chatLog.innerHTML = "";
  contextPromptEl.textContent = "";
  writeResultEl.textContent = "";
  await refreshMemoryPanels();
});

refreshMemoryPanels().catch(() => {});

