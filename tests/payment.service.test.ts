import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertGrossAmountMatches, mapXenditInvoiceStatus } from "../src/services/payment.service.js";

describe("assertGrossAmountMatches", () => {
  it("accepts gross amount strings that match rounded order total", () => {
    assert.doesNotThrow(() => assertGrossAmountMatches(125000, "125000.00"));
  });

  it("rejects mismatched gross amount", () => {
    assert.throws(() => assertGrossAmountMatches(125000, "124000.00"), /Nominal pembayaran/);
  });
});

describe("mapXenditInvoiceStatus", () => {
  it("maps Xendit invoice lifecycle statuses", () => {
    assert.deepEqual(mapXenditInvoiceStatus("PENDING"), {
      paymentStatus: "PENDING",
      orderStatus: "WAITING_PAYMENT"
    });
    assert.deepEqual(mapXenditInvoiceStatus("PAID"), {
      paymentStatus: "PAID",
      orderStatus: "PROCESSING"
    });
    assert.deepEqual(mapXenditInvoiceStatus("EXPIRED"), {
      paymentStatus: "EXPIRED",
      orderStatus: "CANCELLED"
    });
  });
});
