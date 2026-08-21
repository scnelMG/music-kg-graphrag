import { createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

const cookieName = "music_kg_owner_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function equal(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function ownerSessionRequired(): boolean {
  return true;
}

export function ownerWriteSessionRequired(): boolean {
  return true;
}

export function createOwnerSession(setupToken: string): string | null {
  const expectedToken = process.env.MUSIC_KG_OWNER_SETUP_TOKEN;
  const secret = process.env.MUSIC_KG_OWNER_SESSION_SECRET;
  if (expectedToken === undefined || secret === undefined || expectedToken.length < 32 || secret.length < 32) return null;
  if (!equal(setupToken, expectedToken)) return null;
  const payload = `v1.${Math.floor(Date.now() / 1000) + sessionLifetimeSeconds}`;
  return `${payload}.${signature(payload, secret)}`;
}

function hasValidOwnerSession(request: NextRequest): boolean {
  const secret = process.env.MUSIC_KG_OWNER_SESSION_SECRET;
  const value = request.cookies.get(cookieName)?.value;
  if (secret === undefined || secret.length < 32 || value === undefined) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expiresAt = Number(parts[1]);
  return Number.isSafeInteger(expiresAt) && expiresAt > Math.floor(Date.now() / 1000) && equal(parts[2], signature(payload, secret));
}

export function isOwnerSession(request: NextRequest): boolean {
  return hasValidOwnerSession(request);
}

export function isOwnerWriteSession(request: NextRequest): boolean {
  return hasValidOwnerSession(request);
}

export function ownerSessionRequiredResponse(): NextResponse {
  return NextResponse.json({ code: "OWNER_SESSION_REQUIRED", retryable: false }, { status: 401 });
}

export function requireOwnerSession(request: NextRequest): NextResponse | null {
  return isOwnerSession(request) ? null : ownerSessionRequiredResponse();
}

export function requireOwnerWriteSession(request: NextRequest): NextResponse | null {
  return isOwnerWriteSession(request) ? null : ownerSessionRequiredResponse();
}

export function setOwnerSession(response: NextResponse, session: string): NextResponse {
  response.cookies.set(cookieName, session, {
    httpOnly: true,
    maxAge: sessionLifetimeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}

export function clearOwnerSession(response: NextResponse): NextResponse {
  response.cookies.set(cookieName, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return response;
}
