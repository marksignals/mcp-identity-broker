## MCP identity boundary

This project uses an MCP Identity Broker. Read `.mcp-identity.json` before
using a configured provider.

For a provider action covered by that file:

1. Call `identity_status` on the configured broker server.
2. Call `identity_acquire` with the configured identity and provider.
3. Call `identity_invoke` only with the returned lease ID and an allowlisted
   provider tool.
4. Call `identity_release` in a finally-style cleanup step, including after an
   upstream error.

Do not switch a shared CLI account, browser profile, or hosted connector to
work around the broker. A configured tool is not permission to take an
external action: preserve the user's existing authorization requirements.
