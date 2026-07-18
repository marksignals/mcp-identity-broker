import assert from "node:assert/strict";
import test from "node:test";
import { evaluateIdentityBoundary } from "../src/identity-boundary-eval.js";

const config = {
  lease: { default_ttl_seconds: 60, maximum_ttl_seconds: 120 },
  identities: {
    brandA: {
      allowed_principals: ["brand-a-agent"],
      providers: {
        github: {
          command: "node",
          args: ["fake.js"],
          allowed_tools: ["get_me"],
          env: { TOKEN: "${BRAND_A_TOKEN}" }
        }
      }
    }
  }
};

test("identity boundary assessment proves the broker's core lease protections", () => {
  const report = evaluateIdentityBoundary(config);
  assert.equal(report.passed, true);
  assert.equal(report.summary.failed, 0);
  assert.deepEqual(report.checks.map((check) => check.id), [
    "unapproved-principal-denied",
    "unknown-provider-denied",
    "exclusive-lease",
    "owner-only-release",
    "lease-expiry"
  ]);
});
