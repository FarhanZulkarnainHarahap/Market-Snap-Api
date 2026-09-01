import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Profile } from "passport-google-oauth20";
import type { User } from "../prisma/generated/prisma/client.js";
import { findOrCreateOAuthUser, OAuthLoginError, type OAuthUserRepository } from "../src/config/passport.js";

function user(overrides: Partial<User> = {}): User {
  return {
    authProvider: "google",
    avatarUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    email: "buyer@example.com",
    id: "user-1",
    isActive: true,
    name: "Buyer",
    password: null,
    passwordHash: null,
    phone: null,
    referralCode: null,
    referredBy: null,
    role: "CUSTOMER",
    storeId: null,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    verifiedAt: null,
    ...overrides
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: "Google Buyer",
    emails: [{ value: "buyer@example.com", verified: true }],
    id: "google-1",
    name: { familyName: "Buyer", givenName: "Google" },
    photos: [{ value: "https://images.example/avatar.png" }],
    provider: "google",
    _json: { email_verified: true },
    ...overrides
  } as Profile;
}

function repository(methods: Partial<OAuthUserRepository>): OAuthUserRepository {
  return methods as unknown as OAuthUserRepository;
}

describe("Google OAuth profile handling", () => {
  it("creates a new customer from a verified Google profile", async () => {
    let createData: unknown;
    const created = user({ name: "Google Buyer", verifiedAt: new Date() });
    const result = await findOrCreateOAuthUser("google", profile(), repository({
      findFirst: async () => null,
      create: async (args: unknown) => {
        createData = args;
        return created;
      }
    }));

    assert.equal(result, created);
    const data = (createData as { data: Record<string, unknown> }).data;
    assert.equal(data.authProvider, "google");
    assert.equal(data.avatarUrl, "https://images.example/avatar.png");
    assert.equal(data.email, "buyer@example.com");
    assert.equal(data.isActive, true);
    assert.equal(data.name, "Google Buyer");
    assert.equal(data.role, "CUSTOMER");
    assert.ok(data.verifiedAt instanceof Date);
  });

  it("reuses an existing user and preserves their role", async () => {
    const existing = user({ role: "STORE_ADMIN" });
    const updated = user({ role: "STORE_ADMIN", verifiedAt: new Date() });
    let updateData: unknown;
    const result = await findOrCreateOAuthUser("google", profile(), repository({
      findFirst: async () => existing,
      update: async (args: unknown) => {
        updateData = args;
        return updated;
      }
    }));

    assert.equal(result.role, "STORE_ADMIN");
    assert.equal((updateData as { where: { id: string } }).where.id, existing.id);
  });

  it("rejects a Google profile without email", async () => {
    await assert.rejects(
      findOrCreateOAuthUser("google", profile({ emails: [] }), repository({})),
      (error: unknown) => error instanceof OAuthLoginError && /Email Google tidak tersedia/.test(error.message)
    );
  });

  it("rejects an inactive existing user", async () => {
    await assert.rejects(
      findOrCreateOAuthUser("google", profile(), repository({ findFirst: async () => user({ isActive: false }) })),
      (error: unknown) => error instanceof OAuthLoginError && /dinonaktifkan/.test(error.message)
    );
  });

  it("propagates database failures", async () => {
    await assert.rejects(
      findOrCreateOAuthUser("google", profile(), repository({ findFirst: async () => { throw new Error("database unavailable"); } })),
      /database unavailable/
    );
  });
});
