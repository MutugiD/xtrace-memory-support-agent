const GREETING_RE =
  /^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|ty|appreciate it|ok|okay)\b[!. ]*$/i;

export function needsMemory(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.length <= 32 && GREETING_RE.test(trimmed)) return false;
  return true;
}

