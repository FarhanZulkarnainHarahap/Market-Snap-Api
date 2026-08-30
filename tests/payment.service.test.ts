import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isXenditPaymentUrl, secureTokenEquals } from "../src/config/xendit.js";
import {
  assertGrossAmountMatches,
  assertXenditInvoiceAmount,
  assertXenditInvoiceIdentity,
  isFinalInvoiceAvailable,
  mapXenditInvoiceStatus,
  stockTransitionForPayment
} from "../src/services/payment.service.js";

describe("Xendit callback token verification", () => {
  it("rejects missing configured or provided callback tokens", () => {
    assert.equal(secureTokenEquals("", "provided"), false);
    assert.equal(secureTokenEquals("configured", ""), false);
  });

  it("rejects a wrong callback token", () => {
    assert.equal(secureTokenEquals("configured", "wrong"), false);
  });

  it("accepts the correct callback token", () => {
    assert.equal(secureTokenEquals("configured", "configured"), true);
  });
});

describe("isXenditPaymentUrl", () => {
  it("allows official HTTPS hosts and rejects arbitrary or insecure URLs", () => {
    assert.equal(isXenditPaymentUrl("https://checkout.xendit.co/web/invoice-id"), true);
    assert.equal(isXenditPaymentUrl("https://example.com/payment"), false);
    assert.equal(isXenditPaymentUrl("http://checkout.xendit.co/web/invoice-id"), false);
  });
});

describe("assertGrossAmountMatches", () => {
  it("accepts gross amount strings that match rounded order total", () => {
    assert.doesNotThrow(() => assertGrossAmountMatches(125000, "125000.00"));
  });

  it("rejects mismatched gross amount", () => {
    assert.throws(() => assertGrossAmountMatches(125000, "124000.00"), /Nominal pembayaran/);
  });

  it("rejects a mismatched paid amount", () => {
    assert.throws(() => assertXenditInvoiceAmount(125000, {
      amount: 125000,
      paid_amount: 124000,
      status: "PAID"
    }), /Nominal pembayaran/);
  });
});

describe("assertXenditInvoiceIdentity", () => {
  const order = { orderNumber: "ORD-123", xenditInvoiceId: "inv-123" };

  it("rejects a mismatched external ID", () => {
    assert.throws(() => assertXenditInvoiceIdentity(order, { external_id: "ORD-OTHER", id: "inv-123" }), /External ID/);
  });

  it("rejects a mismatched invoice ID", () => {
    assert.throws(() => assertXenditInvoiceIdentity(order, { external_id: "ORD-123", id: "inv-other" }), /Invoice ID/);
  });

  it("accepts matching invoice identity", () => {
    assert.doesNotThrow(() => assertXenditInvoiceIdentity(order, { external_id: "ORD-123", id: "inv-123" }));
  });
});

describe("mapXenditInvoiceStatus", () => {
  it("maps Xendit invoice lifecycle statuses", () => {
    assert.deepEqual(mapXenditInvoiceStatus("PENDING"), {
      paymentStatus: "PENDING",
      orderStatus: "PENDING_PAYMENT"
    });
    assert.deepEqual(mapXenditInvoiceStatus("PAID"), {
      paymentStatus: "PAID",
      orderStatus: "PAID"
    });
    assert.deepEqual(mapXenditInvoiceStatus("EXPIRED"), {
      paymentStatus: "EXPIRED",
      orderStatus: "CANCELLED"
    });
    assert.deepEqual(mapXenditInvoiceStatus("FAILED"), {
      paymentStatus: "FAILED",
      orderStatus: "CANCELLED"
    });
    assert.deepEqual(mapXenditInvoiceStatus("SETTLED"), {
      paymentStatus: "PAID",
      orderStatus: "PAID"
    });
  });
});

describe("stockTransitionForPayment", () => {
  const reservedAt = new Date("2026-08-27T06:00:00.000Z");

  it("commits a reservation only for the first paid transition", () => {
    assert.equal(stockTransitionForPayment({ committedAt: null, current: "PENDING", next: "PAID", releasedAt: null, reservedAt }), "COMMIT");
    assert.equal(stockTransitionForPayment({ committedAt: new Date(), current: "PAID", next: "PAID", releasedAt: null, reservedAt }), null);
  });

  it("releases a pending reservation when payment expires", () => {
    assert.equal(stockTransitionForPayment({ committedAt: null, current: "PENDING", next: "EXPIRED", releasedAt: null, reservedAt }), "RELEASE");
  });

  it("does not release an already released reservation again", () => {
    assert.equal(stockTransitionForPayment({ committedAt: null, current: "EXPIRED", next: "EXPIRED", releasedAt: new Date(), reservedAt }), null);
  });
});

describe("isFinalInvoiceAvailable", () => {
  it("rejects pending invoices and accepts paid invoices", () => {
    assert.equal(isFinalInvoiceAvailable({ paymentStatus: "PENDING", invoiceNumber: null, invoiceSnapshot: null }), false);
    assert.equal(isFinalInvoiceAvailable({ paymentStatus: "PAID", invoiceNumber: "INV-123", invoiceSnapshot: {} }), true);
  });
});
