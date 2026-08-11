import { z } from "zod";

export const APP_ACCESS_COOKIE = "music_kg_access";
export const APP_ACCESS_SESSION_SECONDS = 60 * 60 * 12;

const accessPayloadSchema = z.object({ token: z.string().min(32).max(512) });
const sessionPayloadSchema = z.object({ expiresAt: z.number().int().positive(), version: z.literal(1) });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isProductionAccessRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

export function hasValidAppAccessToken(suppliedToken: string | undefined): boolean {
  const configuredToken = process.env.MUSIC_KG_APP_ACCESS_TOKEN;
  if (configuredToken === undefined || configuredToken.length < 32 || suppliedToken === undefined) return false;
  const expected = new TextEncoder().encode(configuredToken);
  const supplied = new TextEncoder().encode(suppliedToken);
  if (expected.length !== supplied.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const expectedByte = expected[index];
    const suppliedByte = supplied[index];
    if (expectedByte === undefined || suppliedByte === undefined) return false;
    mismatch |= expectedByte ^ suppliedByte;
  }
  return mismatch === 0;
}

export async function createAppAccessSession(now = Date.now()): Promise<string | null> {
  const configuredToken = process.env.MUSIC_KG_APP_ACCESS_TOKEN;
  if (configuredToken === undefined || configuredToken.length < 32) return null;
  const payload = base64Url(encoder.encode(JSON.stringify({
    expiresAt: Math.floor(now / 1_000) + APP_ACCESS_SESSION_SECONDS,
    version: 1
  })));
  const signature = await sign(payload, configuredToken);
  return `${payload}.${base64Url(signature)}`;
}

export async function hasValidAppAccessSession(suppliedSession: string | undefined, now = Date.now()): Promise<boolean> {
  const configuredToken = process.env.MUSIC_KG_APP_ACCESS_TOKEN;
  if (configuredToken === undefined || configuredToken.length < 32 || suppliedSession === undefined) return false;
  const [payload, signature, extra] = suppliedSession.split(".");
  if (payload === undefined || signature === undefined || extra !== undefined) return false;
  const suppliedSignature = fromBase64Url(signature);
  const encodedPayload = fromBase64Url(payload);
  if (suppliedSignature === null || encodedPayload === null) return false;
  const expectedSignature = await sign(payload, configuredToken);
  if (!sameBytes(expectedSignature, suppliedSignature)) return false;
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(decoder.decode(encodedPayload));
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
  const session = sessionPayloadSchema.safeParse(parsedPayload);
  return session.success && session.data.expiresAt > Math.floor(now / 1_000);
}

export function parseAppAccessPayload(payload: unknown): string | null {
  const parsed = accessPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data.token : null;
}

async function sign(payload: string, token: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(token), { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function sameBytes(expected: Uint8Array, supplied: Uint8Array): boolean {
  if (expected.length !== supplied.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const expectedByte = expected[index];
    const suppliedByte = supplied[index];
    if (expectedByte === undefined || suppliedByte === undefined) return false;
    mismatch |= expectedByte ^ suppliedByte;
  }
  return mismatch === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}
