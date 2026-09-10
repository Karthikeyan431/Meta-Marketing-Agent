import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encryptCredential,
  decryptCredential,
  MetaCredentialEncryptionKeyMissingError,
} from "./crypto.js";

const TEST_KEY = randomBytes(32).toString("base64");

describe("Meta credential encryption (meta-token-security.md §2)", () => {
  it("round-trips a plaintext token through encrypt/decrypt", () => {
    const plaintext = "EAAG-fake-long-lived-token-shape-not-a-real-secret";
    const encrypted = encryptCredential(plaintext, TEST_KEY);
    expect(decryptCredential(encrypted, TEST_KEY)).toBe(plaintext);
  });

  it("produces ciphertext that never contains the plaintext substring", () => {
    const plaintext = "super-secret-meta-access-token-value";
    const encrypted = encryptCredential(plaintext, TEST_KEY);
    expect(Buffer.from(encrypted.ciphertext).toString("utf8")).not.toContain(plaintext);
    expect(Buffer.from(encrypted.ciphertext).toString("base64")).not.toContain(plaintext);
  });

  it("throws MetaCredentialEncryptionKeyMissingError when the key is not configured", () => {
    expect(() => encryptCredential("token", undefined)).toThrow(
      MetaCredentialEncryptionKeyMissingError,
    );
  });

  it("rejects a key that does not decode to exactly 32 bytes", () => {
    const shortKey = randomBytes(16).toString("base64");
    expect(() => encryptCredential("token", shortKey)).toThrow(/32 bytes/);
  });

  it("fails to decrypt with the wrong key (authenticity check via GCM auth tag)", () => {
    const encrypted = encryptCredential("token", TEST_KEY);
    const wrongKey = randomBytes(32).toString("base64");
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it("fails to decrypt if the ciphertext is tampered with", () => {
    const encrypted = encryptCredential("token", TEST_KEY);
    const tampered = {
      ...encrypted,
      ciphertext: Uint8Array.from(encrypted.ciphertext.map((b, i) => (i === 0 ? b ^ 0xff : b))),
    };
    expect(() => decryptCredential(tampered, TEST_KEY)).toThrow();
  });

  it("produces a different ciphertext each time (random IV, never reused)", () => {
    const first = encryptCredential("token", TEST_KEY);
    const second = encryptCredential("token", TEST_KEY);
    expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
  });
});
