import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-layer encryption for Meta credential material (meta-token-security.md §2 —
 * "encrypted secret storage OR strong application encryption with managed key protection").
 * AES-256-GCM via Node's built-in `crypto` — no new dependency, no plaintext credential ever
 * written to the database. The symmetric key is read from `META_CREDENTIAL_ENCRYPTION_KEY`
 * (32 bytes, base64-encoded) — never hardcoded, never logged.
 *
 * A managed KMS (e.g. AWS Secrets Manager, ADR-006) is the longer-term target per
 * meta-token-security.md §2, but integrating one is a real new infrastructure dependency
 * this phase does not add — this is a deliberate, documented Phase 3.1 scope decision (see
 * phase-3-1-implementation-report.md's Known Limitations), not an oversight.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

export class MetaCredentialEncryptionKeyMissingError extends Error {
  code = "META_CREDENTIAL_ENCRYPTION_KEY_MISSING";

  constructor() {
    super(
      "META_CREDENTIAL_ENCRYPTION_KEY is not configured — cannot encrypt or decrypt Meta credential material.",
    );
    this.name = "MetaCredentialEncryptionKeyMissingError";
  }
}

function loadKey(encryptionKeyBase64: string | undefined): Buffer {
  if (!encryptionKeyBase64) {
    throw new MetaCredentialEncryptionKeyMissingError();
  }
  const key = Buffer.from(encryptionKeyBase64, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `META_CREDENTIAL_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (got ${key.length}).`,
    );
  }
  return key;
}

/**
 * Plain `Uint8Array` (not `Buffer`) — matches what Prisma's generated client reads/writes
 * for `Bytes` columns natively (a `Buffer<ArrayBufferLike>` is not assignable to Prisma's
 * `Uint8Array<ArrayBuffer>`-typed fields under current TypeScript lib typings).
 */
export interface EncryptedCredential {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
}

export function encryptCredential(
  plaintext: string,
  encryptionKeyBase64: string | undefined,
): EncryptedCredential {
  const key = loadKey(encryptionKeyBase64);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Uint8Array.from(ciphertext),
    iv: Uint8Array.from(iv),
    authTag: Uint8Array.from(authTag),
  };
}

export function decryptCredential(
  encrypted: EncryptedCredential,
  encryptionKeyBase64: string | undefined,
): string {
  const key = loadKey(encryptionKeyBase64);
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext)),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
