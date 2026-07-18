import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const offer = JSON.parse(fs.readFileSync(new URL("../offers/identity-boundary-assessment.json", import.meta.url), "utf8"));

test("assessment offer has a fixed price and bounded delivery scope", () => {
  assert.equal(offer.price.currency, "usd");
  assert.equal(offer.price.unit_amount_cents, 150000);
  assert.equal(offer.price.type, "one_time");
  assert.equal(offer.scope.agent_hosts, 1);
  assert.equal(offer.scope.identity_aliases, 3);
  assert.equal(offer.scope.providers, 2);
  assert.equal(offer.scope.allowlisted_actions, 10);
  assert.equal(offer.checkout.status, "active");
  assert.equal(offer.checkout.url, "https://buy.stripe.com/cNi5kw3nm12zgdq62e3gk03");
});
