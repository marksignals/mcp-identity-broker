#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offer = JSON.parse(fs.readFileSync(path.join(root, "offers", "identity-boundary-assessment.json"), "utf8"));
const key = process.env.MARKSIGNALS_STRIPE_API_KEY;
if (!key) throw new Error("MARKSIGNALS_STRIPE_API_KEY is required; no account was contacted.");

const linkId = offer.checkout?.payment_link_id;
if (!linkId) throw new Error("offer checkout payment_link_id is required.");
const response = await fetch(`https://api.stripe.com/v1/checkout/sessions?payment_link=${encodeURIComponent(linkId)}&limit=100`, {
  headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` }
});
if (!response.ok) throw new Error(`Stripe checkout-session read failed (${response.status}). Check restricted-key permissions.`);
const sessions = (await response.json()).data || [];
const expectedAmount = offer.price.unit_amount_cents;
const paid = sessions.filter((session) => session.payment_status === "paid" && session.amount_total === expectedAmount);

process.stdout.write(JSON.stringify({
  offer_id: offer.offer_id,
  checkout_active: offer.checkout.status === "active",
  checkout_sessions: sessions.length,
  genuine_paid_sessions: paid.length,
  gross_receipts_cents: paid.reduce((total, session) => total + (session.amount_total || 0), 0),
  generated_at: new Date().toISOString()
}, null, 2) + "\n");
