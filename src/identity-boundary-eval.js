import { BrokerError, LeaseStore } from "./broker.js";

function result(id, title, passed, detail) {
  return { id, title, passed, severity: passed ? "info" : "high", detail };
}

function expectsCode(action, code) {
  try {
    action();
  } catch (error) {
    return error instanceof BrokerError && error.code === code;
  }
  return false;
}

/**
 * Exercise the broker's identity boundary without loading credentials or
 * launching an upstream provider. The report is safe to store or share.
 */
export function evaluateIdentityBoundary(config) {
  const identities = Object.entries(config.identities || {});
  if (identities.length === 0) {
    return {
      version: 1,
      passed: false,
      summary: { passed: 0, failed: 1 },
      checks: [result("configured-identity", "At least one identity is configured", false, "No identity aliases were found.")]
    };
  }

  const [identity, identityConfig] = identities[0];
  const [provider] = Object.entries(identityConfig.providers || {})[0] || [];
  const principal = identityConfig.allowed_principals?.[0];
  if (!provider || !principal) {
    return {
      version: 1,
      passed: false,
      summary: { passed: 0, failed: 1 },
      checks: [result("configured-boundary", "Identity has an authorized principal and provider", false, "The selected identity is incomplete.")]
    };
  }

  let now = 1_000;
  let counter = 0;
  const store = new LeaseStore({
    config,
    now: () => now,
    random: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`
  });
  const checks = [];

  checks.push(result(
    "unapproved-principal-denied",
    "An unapproved principal cannot acquire the identity",
    expectsCode(() => store.acquire({ identity, provider, principal: "identity-boundary-eval-unapproved" }), "IDENTITY_DENIED"),
    "The broker must reject a principal absent from the identity allowlist."
  ));

  checks.push(result(
    "unknown-provider-denied",
    "An unconfigured provider cannot acquire the identity",
    expectsCode(() => store.acquire({ identity, provider: "identity-boundary-eval-unknown", principal }), "UNKNOWN_PROVIDER"),
    "An identity lease must be tied to a configured provider."
  ));

  const lease = store.acquire({ identity, provider, principal, ttlSeconds: 1 });
  checks.push(result(
    "exclusive-lease",
    "A held identity cannot be acquired twice",
    expectsCode(() => store.acquire({ identity, provider, principal }), "LEASE_HELD"),
    "Concurrent work must not share one identity lease."
  ));

  checks.push(result(
    "owner-only-release",
    "Only the lease holder can release it",
    expectsCode(() => store.release({ leaseId: lease.lease_id, principal: "identity-boundary-eval-unapproved" }), "LEASE_DENIED"),
    "A second principal must not be able to clear another principal's lease."
  ));

  now += 1_001;
  checks.push(result(
    "lease-expiry",
    "An expired lease cannot be used",
    expectsCode(() => store.require({ leaseId: lease.lease_id, principal }), "UNKNOWN_LEASE"),
    "Expired leases must be removed before provider access."
  ));

  const failed = checks.filter((check) => !check.passed).length;
  return {
    version: 1,
    passed: failed === 0,
    evaluated_identity: identity,
    evaluated_provider: provider,
    summary: { passed: checks.length - failed, failed },
    checks
  };
}
