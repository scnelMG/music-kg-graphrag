import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const initializationVectorBytes = 12;
const authenticationTagBytes = 16;
const maximumHandleBytes = 512;

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function issueRecordHandle(pageId: string, secret: string): string {
  const initializationVector = randomBytes(initializationVectorBytes);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), initializationVector);
  const ciphertext = Buffer.concat([cipher.update(pageId, "utf8"), cipher.final()]);
  return Buffer.concat([initializationVector, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function resolveRecordHandle(handle: string, secret: string): string | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(handle)) return null;
    const payload = Buffer.from(handle, "base64url");
    if (payload.toString("base64url") !== handle) return null;
    if (payload.length <= initializationVectorBytes + authenticationTagBytes || payload.length > maximumHandleBytes) return null;
    const initializationVector = payload.subarray(0, initializationVectorBytes);
    const authenticationTag = payload.subarray(initializationVectorBytes, initializationVectorBytes + authenticationTagBytes);
    const ciphertext = payload.subarray(initializationVectorBytes + authenticationTagBytes);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), initializationVector);
    decipher.setAuthTag(authenticationTag);
    const pageId = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return pageId.trim().length === 0 ? null : pageId;
  } catch {
    return null;
  }
}
