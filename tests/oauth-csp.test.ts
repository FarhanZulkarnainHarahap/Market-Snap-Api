import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.AUTH_SECRET = "oauth-csp-test-secret";
process.env.GOOGLE_CLIENT_ID = "google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

let baseUrl = "";
let server: Server;

before(async () => {
  const { app } = await import("../src/server.js");
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("Google OAuth auto-submit script uses the response CSP nonce", async () => {
  const response = await fetch(`${baseUrl}/auth/google`);
  const body = await response.text();
  const policy = response.headers.get("content-security-policy") ?? "";
  const policyNonce = policy.match(/'nonce-([^']+)'/)?.[1];
  const scriptNonce = body.match(/<script nonce="([^"]+)">/)?.[1];

  assert.equal(response.status, 200);
  assert.ok(policyNonce);
  assert.equal(scriptNonce, policyNonce);
  assert.match(body, /method="post"/);
  assert.match(body, /document\.getElementById\("google-auth-form"\)\.submit\(\)/);
});
