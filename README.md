# MCP Identity Broker

MCP Identity Broker prevents agents from fighting over a single “currently
logged in” account. It is a small local MCP server that maps a named identity
to a separately configured upstream MCP provider process, requires an
exclusive short-lived lease, and exposes only allowlisted upstream tools.

It never reads, writes, or logs a credential. Credential values remain in the
environment or an external secret manager; checked-in configuration contains
only `${ENVIRONMENT_VARIABLE}` references.

## The problem

Most desktop connectors bind to one live OAuth session. Switching that session
for one agent changes it for every other agent. This is unsafe for independent
brands, clients, or repositories.

The broker uses a different unit of control:

```text
agent principal → named identity lease → isolated upstream MCP process → provider
```

An `identity_invoke` call can use only the credentials for the identity named by
its held lease. A RunCue principal cannot acquire `marksignals`; a stale or
released lease cannot invoke anything; and a provider tool must be allowlisted.

## What it is—and is not

- **Is:** a local, stdio MCP gateway for separately configured account aliases.
- **Is:** an isolation primitive for GitHub, Outlook/Graph, Stripe, Gumroad, or
  any provider represented by an upstream stdio MCP server.
- **Is not:** a way to hijack a hosted connector’s current OAuth session.
- **Is not:** multi-user authentication by itself. For multiple simultaneous
  users, run it behind a real authenticated MCP transport or run one broker
  instance per principal.
- **Is not:** a secret store. Use OS environment variables, a vault injector,
  1Password CLI, Azure Key Vault, or equivalent to inject short-lived tokens.

## Quick start

```powershell
npm install
Copy-Item config.example.json identity-broker.json
$env:IDENTITY_BROKER_PRINCIPAL = "marksignals-agent"
$env:MARKSIGNALS_GITHUB_TOKEN = "..." # inject from a vault; never commit
$env:MARKSIGNALS_GITHUB_TOOLS = "get_file_contents,issue_read,create_issue"
node src/server.js --config "$PWD\identity-broker.json"
```

Add the command as a local stdio MCP server in your agent host. The host then
gets four tools:

1. `identity_status`
2. `identity_acquire`
3. `identity_invoke`
4. `identity_release`

Use them in order: acquire → invoke allowlisted tool(s) → release. Leases expire
automatically, and are exclusive per identity—not merely per provider.

## Mark Signals deployment pattern

Do **not** point this at a shared browser or a shared Codex connector. Instead:

1. Create a dedicated Microsoft Graph OAuth credential for
   `marksignals@outlook.com` and a dedicated GitHub credential for the
   `marksignals` account or organization.
2. Configure those credentials only in the `marksignals` alias.
3. Run a broker instance whose `IDENTITY_BROKER_PRINCIPAL` is
   `marksignals-agent`.
4. Give Mark Signals only the needed tool allowlist—for example, mailbox read,
   one email send operation, and exact GitHub repository operations.
5. Keep RunCue and Ultimate Critic in separate aliases/principals or separate
   broker processes.

The hosted Outlook connector in this Codex session cannot be retrofitted by
this program. A small Microsoft Graph MCP server (or another direct provider
adapter) must be configured for the Mark Signals alias. That is intentional:
no shared connector identity is ever switched.

The GitHub example uses GitHub's official MCP server in Docker. If Docker is
not available, build or download its official `github-mcp-server` binary and
replace the `command`/`args` with `github-mcp-server` / `["stdio"]` as described
in that project's documentation. Do not replace the placeholder with an npm
package: GitHub's official server is distributed as a container or binary.

## Security posture

- Rejects literal credentials in config.
- Requires a host-supplied principal from the environment; tool arguments
  cannot choose a principal.
- Enforces identity-level exclusive leases with TTL expiry.
- Enforces provider and tool allowlists before launching an upstream process.
- Returns only sanitized audit metadata for the current principal.

Read [SECURITY.md](SECURITY.md) before using this with production credentials.

## Development

```powershell
npm test
```

## License

MIT.
