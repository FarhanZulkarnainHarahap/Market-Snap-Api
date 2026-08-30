import bcrypt from "bcrypt";
import { createHmac, pbkdf2Sync, timingSafeEqual } from "node:crypto";

export type JwtPayload = {
  sub: string;
  role: string;
  type: "access" | "purpose";
  iat: number;
  exp: number;
};

const accessTokenTtlSeconds = 15 * 60;
const purposeTokenTtlSeconds = 60 * 60;
const bcryptRounds = 12;

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET belum dikonfigurasi");
  return secret;
}

export function signToken(payload: Pick<JwtPayload, "sub" | "role">): string {
  return signJwt({ ...payload, type: "access" }, accessTokenTtlSeconds);
}

export function signPurposeToken(payload: Pick<JwtPayload, "sub" | "role">): string {
  return signJwt({ ...payload, type: "purpose" }, purposeTokenTtlSeconds);
}

function signJwt(payload: Pick<JwtPayload, "sub" | "role" | "type">, ttlSeconds: number): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const issuedAt = now();
  const body = encode({ ...payload, iat: issuedAt, exp: issuedAt + ttlSeconds });
  const signature = signatureFor(header, body);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature || !sameSignature(signature, signatureFor(header, body))) return null;
  if (!validHeader(header)) return null;
  const payload = decode(body);
  if (!payload || payload.exp <= now() || payload.iat > now() + 30) return null;
  return payload;
}

function validHeader(value: string): boolean {
  try {
    const header = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { alg?: unknown; typ?: unknown };
    return header.alg === "HS256" && header.typ === "JWT";
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, bcryptRounds);
}

export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    return bcrypt.compare(password, stored);
  }
  const [scheme, iterationsText, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return false;
  const iterations = Number(iterationsText);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return sameSignature(hash, expected);
}

export function passwordNeedsRehash(stored?: string | null): boolean {
  return Boolean(stored && !stored.startsWith("$2b$"));
}

function signatureFor(header: string, body: string): string {
  return createHmac("sha256", jwtSecret()).update(`${header}.${body}`).digest("base64url");
}

function sameSignature(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value: string): JwtPayload | null {
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<JwtPayload>;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      (payload.type !== "access" && payload.type !== "purpose") ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
