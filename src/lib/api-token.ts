import { createHash, randomBytes } from "crypto";

const PREFIX = "at_";
const WEBHOOK_PREFIX = "wh_";

/** Generate a new raw token — shown to the user exactly once. */
export function generateToken(): string {
  return PREFIX + randomBytes(32).toString("hex");
}

export function generateWebhookToken(): string {
  return WEBHOOK_PREFIX + randomBytes(32).toString("hex");
}

/** SHA-256 hash stored in DB — never the raw token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isApiToken(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function isWebhookToken(value: string): boolean {
  return /^wh_[a-f0-9]{64}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value);
}
