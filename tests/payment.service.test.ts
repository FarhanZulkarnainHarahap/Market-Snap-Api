import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertGrossAmountMatches, mapMidtransStatus, mapXenditInvoiceStatus } from "../src/services/payment.service.js";

describe("mapMidtransStatus", () => {
  it("maps settlement with status 200 to paid processing", () => {
    assert.deepEqual(mapMidtransStatus({ order_id: "ORD-1", status_code: "200", transaction_status: "settlement" }), {
      paymentStatus: "PAID",
      orderStatus: "PROCESSING"
    });
  });

  it("requires capture fraud_status accept before paid", () => {
    assert.deepEqual(mapMidtransStatus({ fraud_status: "accept", order_id: "ORD-1", status_code: "200", transaction_status: "capture" }), {
      paymentStatus: "PAID",
      orderStatus: "PROCESSING"
    });
    assert.deepEqual(mapMidtransStatus({ fraud_status: "challenge", order_id: "ORD-1", status_code: "200", transaction_status: "capture" }), {
      paymentStatus: "PENDING",
      orderStatus: "WAITING_PAYMENT_CONFIRMATION"
    });
    assert.deepEqual(mapMidtransStatus({ fraud_status: "deny", order_id: "ORD-1", status_code: "200", transaction_status: "capture" }), {
      paymentStatus: "FAILED",
      orderStatus: "CANCELLED"
    });
  });

  it("maps pending and final failure statuses", () => {
    assert.deepEqual(mapMidtransStatus({ order_id: "ORD-1", transaction_status: "pending" }), {
      paymentStatus: "PENDING",
      orderStatus: "WAITING_PAYMENT"
    });
    assert.deepEqual(mapMidtransStatus({ order_id: "ORD-1", transaction_status: "expire" }), {
      paymentStatus: "EXPIRED",
      orderStatus: "CANCELLED"
    });
    assert.deepEqual(mapMidtransStatus({ order_id: "ORD-1", transaction_status: "cancel" }), {
      paymentStatus: "CANCELLED",
      orderStatus: "CANCELLED"
    });
    assert.deepEqual(mapMidtransStatus({ order_id: "ORD-1", transaction_status: "failure" }), {
      paymentStatus: "FAILED",
      orderStatus: "CANCELLED"
    });
  });
});

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
