import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../src/config/auth.js";

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
