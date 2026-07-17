import crypto from "node:crypto";
import fs from "node:fs/promises";

const ENV_REFERENCE = /^\$\{[A-Z][A-Z0-9_]*\}$/;

export class BrokerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function loadConfig(path) {
  const parsed = JSON.parse(await fs.readFile(path, "utf8"));
  validateConfig(parsed);
  return parsed;
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || !config.identities || typeof config.identities !== "object") {
    throw new BrokerError("INVALID_CONFIG", "config.identities is required");
  }
  for (const [identity, identityConfig] of Object.entries(config.identities)) {
    if (!Array.isArray(identityConfig.allowed_principals) || identityConfig.allowed_principals.length === 0) {
      throw new BrokerError("INVALID_CONFIG", `${identity}: allowed_principals must be non-empty`);
    }
    if (!identityConfig.providers || typeof identityConfig.providers !== "object") {
      throw new BrokerError("INVALID_CONFIG", `${identity}: providers is required`);
    }
    for (const [provider, providerConfig] of Object.entries(identityConfig.providers)) {
      if (typeof providerConfig.command !== "string" || !Array.isArray(providerConfig.args)) {
        throw new BrokerError("INVALID_CONFIG", `${identity}/${provider}: command and args are required`);
      }
      if (!Array.isArray(providerConfig.allowed_tools) || providerConfig.allowed_tools.length === 0) {
        throw new BrokerError("INVALID_CONFIG", `${identity}/${provider}: allowed_tools must be non-empty`);
      }
      for (const [key, value] of Object.entries(providerConfig.env || {})) {
        if (typeof value !== "string" || !ENV_REFERENCE.test(value)) {
          throw new BrokerError("INVALID_CONFIG", `${identity}/${provider}: ${key} must be an environment reference`);
        }
      }
    }
  }
}

export function resolveProviderEnv(providerConfig, environment = process.env) {
  const resolved = {};
  for (const [key, placeholder] of Object.entries(providerConfig.env || {})) {
    const variable = placeholder.slice(2, -1);
    if (!environment[variable]) {
      throw new BrokerError("MISSING_CREDENTIAL", `required environment variable is absent: ${variable}`);
    }
    resolved[key] = environment[variable];
  }
  return resolved;
}

export class LeaseStore {
  constructor({ config, now = () => Date.now(), random = () => crypto.randomUUID() }) {
    this.config = config;
    this.now = now;
    this.random = random;
    this.leases = new Map();
    this.audit = [];
  }

  _expire() {
    for (const [identity, lease] of this.leases.entries()) {
      if (lease.expires_at_ms <= this.now()) {
        this.leases.delete(identity);
        this._audit("expired", lease);
      }
    }
  }

  _audit(action, lease, extra = {}) {
    this.audit.push({ at: new Date(this.now()).toISOString(), action, identity: lease.identity, provider: lease.provider, principal: lease.principal, ...extra });
    this.audit.splice(0, this.audit.length - 100);
  }

  acquire({ identity, provider, principal, ttlSeconds }) {
    this._expire();
    const identityConfig = this.config.identities[identity];
    if (!identityConfig) throw new BrokerError("UNKNOWN_IDENTITY", "identity is not configured");
    if (!identityConfig.allowed_principals.includes(principal)) throw new BrokerError("IDENTITY_DENIED", "principal is not allowed for this identity");
    if (!identityConfig.providers[provider]) throw new BrokerError("UNKNOWN_PROVIDER", "provider is not configured for this identity");
    const held = this.leases.get(identity);
    if (held) throw new BrokerError("LEASE_HELD", "identity is leased by another principal");
    const maximum = this.config.lease?.maximum_ttl_seconds ?? 900;
    const fallback = this.config.lease?.default_ttl_seconds ?? 120;
    const ttl = ttlSeconds ?? fallback;
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > maximum) throw new BrokerError("INVALID_TTL", `ttl_seconds must be 1-${maximum}`);
    const lease = { lease_id: this.random(), identity, provider, principal, expires_at_ms: this.now() + (ttl * 1000) };
    this.leases.set(identity, lease);
    this._audit("acquired", lease);
    return { lease_id: lease.lease_id, identity, provider, expires_at: new Date(lease.expires_at_ms).toISOString() };
  }

  require({ leaseId, principal }) {
    this._expire();
    const lease = [...this.leases.values()].find((item) => item.lease_id === leaseId);
    if (!lease) throw new BrokerError("UNKNOWN_LEASE", "lease is absent or expired");
    if (lease.principal !== principal) throw new BrokerError("LEASE_DENIED", "lease is owned by another principal");
    return lease;
  }

  release({ leaseId, principal }) {
    const lease = this.require({ leaseId, principal });
    this.leases.delete(lease.identity);
    this._audit("released", lease);
    return { released: true, identity: lease.identity, provider: lease.provider };
  }

  status(principal) {
    this._expire();
    return {
      principal,
      identities: Object.entries(this.config.identities).map(([name, identity]) => ({
        identity: name,
        accessible: identity.allowed_principals.includes(principal),
        leased: this.leases.has(name),
        providers: Object.entries(identity.providers).map(([provider, detail]) => ({ provider, allowed_tools: detail.allowed_tools }))
      })),
      audit: this.audit.filter((entry) => entry.principal === principal)
    };
  }
}
