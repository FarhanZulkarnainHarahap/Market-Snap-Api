import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export type JwtPayload = {
  sub: string;
  role: string;
  iat: number;
  exp: number;
};

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET belum dikonfigurasi");
  return secret;
}

export function signToken(payload: Pick<JwtPayload, "sub" | "role">): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const issuedAt = now();
  const body = encode({ ...payload, iat: issuedAt, exp: issuedAt + 60 * 60 * 24 });
  const signature = signatureFor(header, body);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature || !sameSignature(signature, signatureFor(header, body))) return null;
  const payload = decode(body);
  if (!payload || payload.exp < now()) return null;
  return payload;
}

export function hashPassword(password: string): string {
  const iterations = 120000;
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored?: string | null): boolean {
  if (!stored) return false;
  const [scheme, iterationsText, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return stored === password;
  const iterations = Number(iterationsText);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return sameSignature(hash, expected);
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
    if (typeof payload.sub !== "string" || typeof payload.role !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
