import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey(): Buffer {
    const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
    if (!raw) throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error("INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }
    return key;
}

export function validateIntegrationEncryptionKey(): boolean {
    try {
        encryptionKey();
        return true;
    } catch {
        return false;
    }
}

export function isEncryptedSecret(value: unknown): value is string {
    return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(value: string): string {
    if (isEncryptedSecret(value)) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string): string {
    if (!isEncryptedSecret(value)) return value;
    const parts = value.split(":");
    if (parts.length !== 5) throw new Error("Encrypted secret has an invalid envelope");
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const ciphertext = Buffer.from(parts[4], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
    return encryptSecret(JSON.stringify(value ?? {}));
}

export function decryptJson<T>(value: unknown): T {
    if (typeof value !== "string") return value as T;
    return JSON.parse(decryptSecret(value)) as T;
}
