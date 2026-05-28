const SENSITIVE_KEYS = [
  "token",
  "secret",
  "password",
  "refreshToken",
  "accessToken",
  "clientSecret",
  "authorization"
];

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item)) as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((needle) => key.toLowerCase().includes(needle.toLowerCase()))) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactSensitive(nested);
      }
    }
    return out as T;
  }

  return value;
}
