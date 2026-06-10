import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
}

export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

// Serialize encrypted data to a single string for single-column storage
export function encryptToString(plaintext: string): string {
  const { encryptedData, iv, authTag } = encrypt(plaintext);
  return `${iv}:${authTag}:${encryptedData}`;
}

export function decryptFromString(serialized: string): string {
  const first = serialized.indexOf(":");
  const second = serialized.indexOf(":", first + 1);
  const iv = serialized.slice(0, first);
  const authTag = serialized.slice(first + 1, second);
  const encryptedData = serialized.slice(second + 1);
  return decrypt(encryptedData, iv, authTag);
}

export function decrypt(encryptedData: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
