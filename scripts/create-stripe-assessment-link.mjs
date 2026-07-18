#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const offer = JSON.parse(fs.readFileSync(path.join(root, "offers", "identity-boundary-assessment.json"), "utf8"));
const key = process.env.MARKSIGNALS_STRIPE_API_KEY;
if (!key) throw new Error("MARKSIGNALS_STRIPE_API_KEY is required; no account was contacted.");
if (!process.argv.includes("--publish")) {
  process.stdout.write("READY: run again with --publish to create the live Stripe product, price, and payment link.\n");
  process.exit(0);
}

function form(entries) {
  return new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString();
}

async function stripe(pathname, entries, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey
    },
    body: form(entries)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Stripe request failed (${response.status}): ${body?.error?.message || "unknown error"}`);
  return body;
}

const suffix = offer.offer_id;
const product = await stripe("/products", [
  ["name", offer.name],
  ["description", "Map agent identities, test wrong-account boundaries, and receive a rerun proof."],
  ["metadata[offer_id]", offer.offer_id]
], `${suffix}-product-v1`);
const price = await stripe("/prices", [
  ["product", product.id],
  ["currency", offer.price.currency],
  ["unit_amount", offer.price.unit_amount_cents],
  ["metadata[offer_id]", offer.offer_id]
], `${suffix}-price-v1`);
const link = await stripe("/payment_links", [
  ["line_items[0][price]", price.id],
  ["line_items[0][quantity]", 1],
  ["after_completion[type]", "hosted_confirmation"],
  ["after_completion[hosted_confirmation][custom_message]", "Payment received. We will send assessment intake details within one business day."],
  ["metadata[offer_id]", offer.offer_id]
], `${suffix}-link-v1`);

process.stdout.write(JSON.stringify({ offer_id: offer.offer_id, payment_link_url: link.url, payment_link_id: link.id }, null, 2) + "\n");
