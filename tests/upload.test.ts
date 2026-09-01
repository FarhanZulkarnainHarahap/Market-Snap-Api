import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesImageSignature } from "../src/middleware/upload.js";

describe("upload content validation", () => {
  it("accepts valid PNG, JPEG, and GIF signatures", () => {
    assert.equal(matchesImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
    assert.equal(matchesImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
    assert.equal(matchesImageSignature(Buffer.from("GIF89a"), "image/gif"), true);
  });

  it("rejects content spoofed with an image MIME type", () => {
    assert.equal(matchesImageSignature(Buffer.from("<script>alert(1)</script>"), "image/png"), false);
    assert.equal(matchesImageSignature(Buffer.from("not-an-image"), "image/jpeg"), false);
  });
});
