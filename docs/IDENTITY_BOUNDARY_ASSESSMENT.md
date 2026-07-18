# Identity Boundary Assessment

An agent that can reach several accounts needs more than a remembered browser
login. It needs a way to prove that one task cannot quietly act as another
brand, client, or team.

This repository includes a small, repeatable configuration assessment. It is
the free starting point for an identity-boundary review.

```powershell
npm run eval:identity-boundary -- .\identity-broker.json
```

The command emits a shareable JSON report and exits non-zero on a failed
boundary. It never starts an upstream MCP provider, calls a provider API, or
prints a credential. The checks confirm that a configured broker rejects an
unapproved principal and an unknown provider, preserves an exclusive lease,
prevents a second principal from releasing that lease, and invalidates an
expired lease.

## What a paid assessment adds

A real deployment review is not a generic security scan. It is a fixed-scope
evaluation of one agent host and the accounts it can reach:

1. Map every identity, provider, principal, and allowed action.
2. Run the boundary checks against the configured broker.
3. Review the provider credentials and allowlists for least privilege without
   collecting or retaining secret values.
4. Attempt agreed, non-destructive wrong-identity scenarios in a disposable or
   read-only environment.
5. Deliver a short findings report, remediation plan, and a rerun command.

This is useful to a small team deploying agents across a company account and
client accounts, or across multiple brands. It is not a replacement for an
enterprise identity provider, a penetration test, or provider-side access
control.

## A useful passing standard

Treat an environment as ready only when every provider is attached to a named
identity alias, every alias has an explicit principal allowlist and short lease
policy, every upstream tool is allowlisted, credentials are injected only into
the child provider process, and the same report can be rerun after a change.

The evaluation code is intentionally open. The value of an assessment is the
specific account map, the threat model, the evidence, and the remediation—not
an opaque scanner.
