import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import passport from "passport";

process.env.JWT_SECRET = "oauth-state-test-secret";
process.env.GOOGLE_CLIENT_ID = "google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:4100/api/auth/google/callback";

let baseUrl = "";
let server: Server;

before(async () => {
  const { app } = await import("../src/server.js");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("Google OAuth redirects directly to Google with state and the production callback contract", async () => {
  const response = await fetch(`${baseUrl}/api/auth/google`, { redirect: "manual" });
  const location = new URL(String(response.headers.get("location")));

  assert.equal(response.status, 302);
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("redirect_uri"), "http://localhost:4100/api/auth/google/callback");
  assert.ok(location.searchParams.get("state"));
  assert.match(response.headers.get("set-cookie") ?? "", /market_snap_oauth_state_google=/);
});

test("Google OAuth cancellation returns a visible frontend error instead of a blank page", async () => {
  const start = await fetch(`${baseUrl}/api/auth/google`, { redirect: "manual" });
  const providerUrl = new URL(String(start.headers.get("location")));
  const state = String(providerUrl.searchParams.get("state"));
  const cookie = String(start.headers.get("set-cookie")).split(";", 1)[0];
  const callback = await fetch(`${baseUrl}/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, {
    headers: { cookie },
    redirect: "manual"
  });
  const frontendUrl = new URL(String(callback.headers.get("location")));

  assert.equal(callback.status, 302);
  assert.equal(frontendUrl.pathname, "/auth/callback");
  assert.equal(frontendUrl.searchParams.get("provider"), "google");
  assert.match(frontendUrl.searchParams.get("error") ?? "", /dibatalkan/i);
});

test("Google OAuth rejects an invalid state before authenticating", async () => {
  const callback = await fetch(`${baseUrl}/api/auth/google/callback?state=invalid`, { redirect: "manual" });
  const frontendUrl = new URL(String(callback.headers.get("location")));

  assert.equal(callback.status, 302);
  assert.equal(frontendUrl.pathname, "/auth/callback");
  assert.match(frontendUrl.searchParams.get("error") ?? "", /tidak valid|kedaluwarsa/i);
});

test("Google OAuth callback creates the legacy stateless session from a mocked verified profile", async () => {
  const start = await fetch(`${baseUrl}/api/auth/google`, { redirect: "manual" });
  const providerUrl = new URL(String(start.headers.get("location")));
  const state = String(providerUrl.searchParams.get("state"));
  const cookie = String(start.headers.get("set-cookie")).split(";", 1)[0];
  const { oauthPassport } = await import("../src/config/passport.js");
  const originalStrategy = oauthPassport._strategy("google");

  class MockVerifiedGoogleProfileStrategy extends passport.Strategy {
    override name = "google";

    override authenticate(): void {
      this.success({ id: "existing-store-admin", role: "STORE_ADMIN" } as Express.User);
    }
  }

  oauthPassport.use(new MockVerifiedGoogleProfileStrategy());
  try {
    const callback = await fetch(`${baseUrl}/api/auth/google/callback?code=mock-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
      redirect: "manual"
    });
    const frontendUrl = new URL(String(callback.headers.get("location")));

    assert.equal(callback.status, 302);
    assert.equal(frontendUrl.pathname, "/auth/callback");
    assert.equal(frontendUrl.searchParams.get("success"), "1");
    assert.match(callback.headers.get("set-cookie") ?? "", /market_snap_session=/);
  } finally {
    oauthPassport.use(originalStrategy);
  }
});
