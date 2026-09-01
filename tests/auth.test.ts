import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../src/config/auth.js";
import { registerSchema } from "../src/middleware/schemas.js";

describe("credential password security", () => {
  it("stores and verifies bcrypt hashes", async () => {
    const hash = await hashPassword("password123");
    assert.match(hash, /^\$2[aby]\$/);
    assert.equal(await verifyPassword("password123", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
    assert.equal(passwordNeedsRehash(hash), false);
  });

  it("never accepts a legacy plaintext password", async () => {
    assert.equal(await verifyPassword("password123", "password123"), false);
  });
});

describe("credential input validation", () => {
  it("requires mixed-case letters and a number for new passwords", () => {
    assert.equal(registerSchema.safeParse({ name: "Demo User", email: "demo@example.com", password: "password123" }).success, false);
    assert.equal(registerSchema.safeParse({ name: "Demo User", email: "demo@example.com", password: "Password123" }).success, true);
  });
});
