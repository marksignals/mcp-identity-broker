import assert from "node:assert/strict";
import test from "node:test";
import { BrokerError, LeaseStore, resolveProviderEnv, validateConfig } from "../src/broker.js";

const config = {
  lease: { default_ttl_seconds: 60, maximum_ttl_seconds: 120 },
  identities: {
    brandA: {
      allowed_principals: ["brand-a-agent"],
      providers: { github: { command: "node", args: ["fake.js"], allowed_tools: ["get_me"], env: { TOKEN: "${BRAND_A_TOKEN}" } } }
    },
    clientB: {
      allowed_principals: ["client-b-agent"],
      providers: { github: { command: "node", args: ["fake.js"], allowed_tools: ["get_me"], env: { TOKEN: "${CLIENT_B_TOKEN}" } } }
    }
  }
};

test("an identity is exclusive and released only by its holder", () => {
  let now = 1000;
  const store = new LeaseStore({ config, now: () => now, random: () => "00000000-0000-4000-8000-000000000001" });
  const lease = store.acquire({ identity: "brandA", provider: "github", principal: "brand-a-agent" });
  assert.throws(() => store.acquire({ identity: "brandA", provider: "github", principal: "brand-a-agent" }), (error) => error.code === "LEASE_HELD");
  assert.throws(() => store.release({ leaseId: lease.lease_id, principal: "client-b-agent" }), (error) => error.code === "LEASE_DENIED");
  assert.deepEqual(store.release({ leaseId: lease.lease_id, principal: "brand-a-agent" }), { released: true, identity: "brandA", provider: "github" });
  now += 1;
  assert.equal(store.acquire({ identity: "brandA", provider: "github", principal: "brand-a-agent" }).identity, "brandA");
});

test("leases expire and do not leak across principals", () => {
  let now = 1000;
  const store = new LeaseStore({ config, now: () => now, random: () => "00000000-0000-4000-8000-000000000002" });
  store.acquire({ identity: "brandA", provider: "github", principal: "brand-a-agent", ttlSeconds: 1 });
  now += 1001;
  assert.throws(() => store.require({ leaseId: "00000000-0000-4000-8000-000000000002", principal: "brand-a-agent" }), (error) => error.code === "UNKNOWN_LEASE");
  assert.throws(() => store.acquire({ identity: "brandA", provider: "github", principal: "client-b-agent" }), (error) => error.code === "IDENTITY_DENIED");
});

test("configuration never accepts literal credentials", () => {
  const unsafe = structuredClone(config);
  unsafe.identities.brandA.providers.github.env.TOKEN = "actual-secret";
  assert.throws(() => validateConfig(unsafe), (error) => error instanceof BrokerError && error.code === "INVALID_CONFIG");
  assert.deepEqual(resolveProviderEnv(config.identities.brandA.providers.github, { BRAND_A_TOKEN: "opaque" }), { TOKEN: "opaque" });
});
