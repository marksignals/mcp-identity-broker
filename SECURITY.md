# Security policy

## Threat model

This project protects against accidental cross-brand/account use by cooperating
agents sharing a machine. It does not make an untrusted local machine safe and
does not replace provider-side authorization.

## Deployment requirements

1. Run one broker process per authenticated MCP principal, or put the process
   behind an authenticated transport that derives the principal server-side.
2. Keep `identity-broker.json` local and permission-restricted. It contains no
   secrets, but it reveals operational topology and tool permissions.
3. Inject short-lived provider credentials through a vault or environment.
   Never add credentials to config, source, test fixtures, issues, or logs.
4. Restrict upstream tool allowlists to the minimum required action set.
5. Use provider-native least privilege, separate application registrations or
   service identities, and audit logs.
6. Treat a broker restart as lease invalidation. Leases are intentionally
   in-memory in v0.1.

## Reporting a vulnerability

Do not open a public issue with credentials or a reproducible attack against a
live account. Open a private GitHub security advisory for this repository or
contact the maintainers through the repository security channel.
