import assert from "node:assert/strict";
import test from "node:test";
import { BrokerError, LeaseStore, resolveProviderEnv, validateConfig } from "../src/broker.js";

const config = {
  lease: { default_ttl_seconds: 60, maximum_ttl_seconds: 120 },
  identities: {
    marksignals: {
      allowed_principals: ["marksignals-agent"],
      providers: { github: { command: "node", args: ["fake.js"], allowed_tools: ["get_me"], env: { TOKEN: "${MARKSIGNALS_TOKEN}" } } }
    },
    runcue: {
      allowed_principals: ["runcue-agent"],
      providers: { github: { command: "node", args: ["fake.js"], allowed_tools: ["get_me"], env: { TOKEN: "${RUNCUE_TOKEN}" } } }
    }
  }
};

test("an identity is exclusive and released only by its holder", () => {
  let now = 1000;
  const store = new LeaseStore({ config, now: () => now, random: () => "00000000-0000-4000-8000-000000000001" });
  const lease = store.acquire({ identity: "marksignals", provider: "github", principal: "marksignals-agent" });
  assert.throws(() => store.acquire({ identity: "marksignals", provider: "github", principal: "marksignals-agent" }), (error) => error.code === "LEASE_HELD");
  assert.throws(() => store.release({ leaseId: lease.lease_id, principal: "runcue-agent" }), (error) => error.code === "LEASE_DENIED");
  assert.deepEqual(store.release({ leaseId: lease.lease_id, principal: "marksignals-agent" }), { released: true, identity: "marksignals", provider: "github" });
  now += 1;
  assert.equal(store.acquire({ identity: "marksignals", provider: "github", principal: "marksignals-agent" }).identity, "marksignals");
});

test("leases expire and do not leak across principals", () => {
  let now = 1000;
  const store = new LeaseStore({ config, now: () => now, random: () => "00000000-0000-4000-8000-000000000002" });
  store.acquire({ identity: "marksignals", provider: "github", principal: "marksignals-agent", ttlSeconds: 1 });
  now += 1001;
  assert.throws(() => store.require({ leaseId: "00000000-0000-4000-8000-000000000002", principal: "marksignals-agent" }), (error) => error.code === "UNKNOWN_LEASE");
  assert.throws(() => store.acquire({ identity: "marksignals", provider: "github", principal: "runcue-agent" }), (error) => error.code === "IDENTITY_DENIED");
});

test("configuration never accepts literal credentials", () => {
  const unsafe = structuredClone(config);
  unsafe.identities.marksignals.providers.github.env.TOKEN = "actual-secret";
  assert.throws(() => validateConfig(unsafe), (error) => error instanceof BrokerError && error.code === "INVALID_CONFIG");
  assert.deepEqual(resolveProviderEnv(config.identities.marksignals.providers.github, { MARKSIGNALS_TOKEN: "opaque" }), { TOKEN: "opaque" });
});
