# MCP Identity Broker

Keep MCP agents from acting as the wrong account.

MCP Identity Broker is a local stdio MCP server for teams that run agents across
more than one account, brand, client, or repository. Before an agent can use a
provider, it must acquire a named identity. That lease is exclusive,
time-limited, and limited to the provider tools you allow.

```text
agent principal -> identity lease -> isolated provider process -> provider account
```

The broker does not store credentials. Your secret manager or environment
injects them only into the provider process for the identity being used.

## When this helps

Use this when one agent host can reach more than one account and "whoever is
currently logged in" is not an acceptable permission model. Typical examples:

- separate GitHub accounts for a product and a client;
- separate mailboxes for separate brands;
- an operations agent that may read one service but must not touch another.

If every task uses one account and one provider, you probably do not need this.

## What it does

For each configured identity, the broker:

- permits only named principals to acquire it;
- grants one holder an exclusive lease with a time-to-live;
- starts the configured upstream stdio MCP provider with that identity's
  environment only;
- allows only the provider tools listed in that identity's configuration; and
- returns audit metadata without returning credentials.

## What it does not do

- It cannot switch or take over a hosted connector's shared OAuth session.
- It is not a secret manager or a substitute for provider-side least privilege.
- It is not multi-user authentication. Run one broker per trusted principal, or
  put it behind an authenticated transport that derives the principal
  server-side.
- It does not make an untrusted local machine safe.

## Quick start

### 1. Install and create local config

Requires Node.js 20 or later. Clone this repository, then run:

```powershell
npm install
Copy-Item config.example.json identity-broker.json
```

`identity-broker.json` is intentionally ignored by Git. It contains no literal
secrets, but it does describe your account aliases and allowed tools.

### 2. Provide a principal and provider credentials

Use your operating system, vault, or secret-injection tool to provide the
variables referenced by your local config. For the GitHub example:

```powershell
$env:IDENTITY_BROKER_PRINCIPAL = "brand-a-agent"
$env:BRAND_A_GITHUB_TOKEN = "<token from your secret manager>"
$env:BRAND_A_GITHUB_TOOLS = "get_file_contents,issue_read,create_issue"
```

Never commit a token. The broker rejects literal credential values in its JSON
configuration.

### 3. Start the broker

```powershell
node src/server.js --config "$PWD\identity-broker.json"
```

Configure that command as a local stdio MCP server in your agent host. The host
receives four broker tools:

| Tool | Use it to |
| --- | --- |
| `identity_status` | Check accessible identities, lease state, and allowed tools. |
| `identity_acquire` | Acquire an identity and receive a lease ID. |
| `identity_invoke` | Call one allowlisted provider tool with that lease. |
| `identity_release` | Release the lease when the work is complete. |

The normal call sequence is:

```text
status -> acquire -> invoke -> release
```

An expired or released lease cannot invoke a provider tool. A second holder
cannot acquire an identity while it is leased.

## Adopt it in an existing project

If a project already has an agent in progress, give it a small identity
contract instead of relying on a remembered account or browser session.

1. Copy [`templates/project-identity.json`](templates/project-identity.json)
   to `.mcp-identity.json` in the project. Use an alias and principal that are
   specific to that project; never put a credential in this file.
2. Add [`templates/AGENTS.identity-broker.md`](templates/AGENTS.identity-broker.md)
   to the project's agent instructions. Claude Code users can place the same
   instructions in `CLAUDE.md`.
3. Register this broker once in the agent host, with a launcher that fixes the
   principal and supplies only that project's provider credentials.

After that, an MCP-capable coding agent can read `.mcp-identity.json`, acquire
the configured identity, use an allowlisted provider tool, and release the
lease. The file tells the agent *which* identity to use; the broker remains the
enforcement point.

This is intentionally not automatic just because an agent can see this GitHub
repository. A host must explicitly install a local stdio MCP server before it
can launch local code or access credentials.

## Configure identities

The example config shows the shape:

```json
{
  "identities": {
    "brand-a": {
      "allowed_principals": ["brand-a-agent"],
      "providers": {
        "github": {
          "command": "docker",
          "args": ["run", "-i", "--rm", "..."],
          "allowed_tools": ["get_file_contents", "issue_read"],
          "env": {
            "GITHUB_PERSONAL_ACCESS_TOKEN": "${BRAND_A_GITHUB_TOKEN}"
          }
        }
      }
    }
  }
}
```

Each provider needs a command, arguments, an explicit tool allowlist, and
environment-variable references. The broker resolves those references only when
it starts the upstream provider process.

The included GitHub example uses the [official GitHub MCP
server](https://github.com/github/github-mcp-server). Docker is optional if you
install the official binary and update `command` and `args` in your local
config.

## GitHub CLI account helper

`scripts/start-github-identity-broker.mjs` is an optional launcher for a GitHub
CLI setup that already stores multiple accounts. It reads the selected identity
and provider from your config, then makes that account's token available to the
broker child process only. It does not run `gh auth switch`, so it does not
change another agent's active GitHub CLI account.

```powershell
node .\scripts\start-github-identity-broker.mjs `
  --config "$PWD\identity-broker.json" `
  --github-user brand-a-github `
  --principal brand-a-agent `
  --identity brand-a
```

## Security notes

- Keep local config permission-restricted.
- Use short-lived, provider-scoped credentials where possible.
- Allow only the tools needed for the specific identity.
- Treat a broker restart as lease invalidation. Leases are in memory in v0.1.
- Read [SECURITY.md](SECURITY.md) before using production credentials.

## Development

```powershell
npm test
```

The test suite covers exclusive leases, expiry, cross-principal isolation, and
rejection of literal credentials in configuration.

## Assess a configuration

Run the included [Identity Boundary Assessment](docs/IDENTITY_BOUNDARY_ASSESSMENT.md)
to create a safe, repeatable pass/fail report for a broker configuration. It
does not start a provider or read a credential.

```powershell
npm run eval:identity-boundary -- .\identity-broker.json
```

## Fixed-scope assessment

The broker stays free and open source. Teams that need help applying it can
buy an [Identity Boundary Assessment](offers/identity-boundary-assessment.json):
one agent host, up to three account aliases, two providers, and ten permitted
actions. The fixed price is $1,500 USD. The deliverable is a private map,
boundary findings, fixes, and a rerun proof within five business days.

[Buy the assessment](https://buy.stripe.com/cNi5kw3nm12zgdq62e3gk03)

This is not an enterprise IAM deployment or a penetration test. Read the
[report template](docs/IDENTITY_BOUNDARY_ASSESSMENT_REPORT_TEMPLATE.md) before
buying so the acceptance criteria are explicit.

The optional Stripe launcher requires a dedicated `MARKSIGNALS_STRIPE_API_KEY`.
It performs no action without `--publish`:

```powershell
node .\scripts\create-stripe-assessment-link.mjs
node .\scripts\create-stripe-assessment-link.mjs --publish
```

The standard Stripe **One-time payments** restricted-key template supplies the
write permissions this launcher needs. It does not need account-profile read
permission.

## License

[MIT](LICENSE)
