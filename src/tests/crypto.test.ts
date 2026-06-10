import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptToString, decryptFromString } from "@/lib/crypto";

// ─── encrypt / decrypt roundtrip ─────────────────────────────────────────────

describe("encrypt / decrypt roundtrip", () => {
  it("decrypts back to original plaintext", () => {
    const original = "super secret ssh key material";
    const { encryptedData, iv, authTag } = encrypt(original);
    expect(decrypt(encryptedData, iv, authTag)).toBe(original);
  });

  it("handles empty string", () => {
    const { encryptedData, iv, authTag } = encrypt("");
    expect(decrypt(encryptedData, iv, authTag)).toBe("");
  });

  it("handles unicode / multiline PEM content", () => {
    const pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nABCDEFGHIJKL\n-----END OPENSSH PRIVATE KEY-----\n";
    const { encryptedData, iv, authTag } = encrypt(pem);
    expect(decrypt(encryptedData, iv, authTag)).toBe(pem);
  });

  it("handles long strings (> 10KB)", () => {
    const large = "x".repeat(15_000);
    const { encryptedData, iv, authTag } = encrypt(large);
    expect(decrypt(encryptedData, iv, authTag)).toBe(large);
  });
});

// ─── randomness ──────────────────────────────────────────────────────────────

describe("randomness", () => {
  it("produces a different IV every call", () => {
    const a = encrypt("same input");
    const b = encrypt("same input");
    expect(a.iv).not.toBe(b.iv);
  });

  it("produces different ciphertext even for identical plaintext", () => {
    const a = encrypt("same input");
    const b = encrypt("same input");
    expect(a.encryptedData).not.toBe(b.encryptedData);
  });
});

// ─── tamper detection (GCM auth tag) ─────────────────────────────────────────

describe("tamper detection (GCM auth tag)", () => {
  it("throws when authTag is corrupted", () => {
    const { encryptedData, iv } = encrypt("sensitive data");
    const badTag = "deadbeefdeadbeefdeadbeefdeadbeef";
    expect(() => decrypt(encryptedData, iv, badTag)).toThrow();
  });

  it("throws when ciphertext is corrupted", () => {
    const { iv, authTag } = encrypt("sensitive data");
    const badCipher = Buffer.alloc(16).toString("base64");
    expect(() => decrypt(badCipher, iv, authTag)).toThrow();
  });

  it("throws when IV is corrupted", () => {
    const { encryptedData, authTag } = encrypt("sensitive data");
    const badIv = "00000000000000000000000000000000";
    expect(() => decrypt(encryptedData, badIv, authTag)).toThrow();
  });
});

// ─── invalid key ─────────────────────────────────────────────────────────────

describe("invalid key", () => {
  it("throws if ENCRYPTION_KEY is missing", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = original;
  });

  it("throws if ENCRYPTION_KEY is wrong length", () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = original;
  });
});

// ─── encryptToString / decryptFromString ─────────────────────────────────────

describe("encryptToString / decryptFromString", () => {
  it("roundtrips via a single string", () => {
    const original = "community-submit-token-abc123";
    const serialized = encryptToString(original);
    expect(decryptFromString(serialized)).toBe(original);
  });

  it("serialized form is a non-empty string", () => {
    expect(typeof encryptToString("hello")).toBe("string");
    expect(encryptToString("hello").length).toBeGreaterThan(0);
  });

  it("two encryptions produce different serialized strings", () => {
    const a = encryptToString("same");
    const b = encryptToString("same");
    expect(a).not.toBe(b);
  });

  it("throws if serialized string is tampered", () => {
    const s = encryptToString("test");
    const tampered = s.slice(0, -4) + "xxxx";
    expect(() => decryptFromString(tampered)).toThrow();
  });
});
