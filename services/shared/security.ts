import crypto from "node:crypto";
import type { ServiceRole } from "./types.js";

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptJson(value: unknown, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptJson<T>(value: string, secret: string): T {
  const [ivB64, encryptedB64, tagB64] = value.split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function assertRoleAllowed(role: ServiceRole, allowed: ServiceRole[]): void {
  if (!allowed.includes(role)) {
    throw new Error(`Role ${role} is not allowed for this operation.`);
  }
}

type InternalTokenPayload = {
  service: string;
  tenantId: string;
  role: ServiceRole | "system";
  exp: number;
};

export function createInternalToken(
  payload: Omit<InternalTokenPayload, "exp">,
  secret: string,
  expiresInSeconds = 300
): string {
  const fullPayload: InternalTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyInternalToken(token: string, secret: string): InternalTokenPayload {
  const [encoded, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature !== expected) throw new Error("Invalid internal token signature.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as InternalTokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Internal token expired.");
  return payload;
}
