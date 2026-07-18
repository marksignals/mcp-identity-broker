#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BrokerError, LeaseStore, loadConfig, resolveProviderEnv } from "./broker.js";

const args = process.argv.slice(2);
const configFlag = args.indexOf("--config");
if (configFlag < 0 || !args[configFlag + 1]) throw new Error("usage: mcp-identity-broker --config /absolute/path/to/config.json");

const config = await loadConfig(path.resolve(args[configFlag + 1]));
const principal = process.env[config.principal_env || "IDENTITY_BROKER_PRINCIPAL"];
if (!principal) throw new Error(`missing required principal environment variable: ${config.principal_env || "IDENTITY_BROKER_PRINCIPAL"}`);
const leases = new LeaseStore({ config });
const server = new Server({ name: "mcp-identity-broker", version: "0.1.0" }, { capabilities: { tools: {} } });

const schemas = {
  acquire: z.object({ identity: z.string().min(1), provider: z.string().min(1), ttl_seconds: z.number().int().positive().optional() }),
  invoke: z.object({ lease_id: z.string().uuid(), tool_name: z.string().min(1), arguments: z.record(z.unknown()).default({}) }),
  release: z.object({ lease_id: z.string().uuid() })
};

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

async function invoke(lease, toolName, toolArguments) {
  const provider = config.identities[lease.identity].providers[lease.provider];
  if (!provider.allowed_tools.includes(toolName)) throw new BrokerError("TOOL_DENIED", "tool is not allowlisted for this identity/provider");
  const providerEnv = resolveProviderEnv(provider);
  const transport = new StdioClientTransport({ command: provider.command, args: provider.args, env: { ...process.env, ...providerEnv } });
  const client = new Client({ name: "mcp-identity-broker-upstream", version: "0.1.0" });
  try {
    await client.connect(transport);
    return await client.callTool({ name: toolName, arguments: toolArguments });
  } finally {
    await client.close();
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: "identity_status", description: "Show accessible aliases, leased state, and allowlisted upstream tools without exposing credentials.", inputSchema: { type: "object", properties: {} } },
  { name: "identity_acquire", description: "Acquire an exclusive, short-lived identity lease before invoking an upstream provider tool.", inputSchema: { type: "object", properties: { identity: { type: "string" }, provider: { type: "string" }, ttl_seconds: { type: "integer" } }, required: ["identity", "provider"] } },
  { name: "identity_invoke", description: "Invoke one allowlisted upstream MCP tool using only the identity tied to a held lease.", inputSchema: { type: "object", properties: { lease_id: { type: "string" }, tool_name: { type: "string" }, arguments: { type: "object" } }, required: ["lease_id", "tool_name"] } },
  { name: "identity_release", description: "Release an identity lease immediately after the required provider action completes.", inputSchema: { type: "object", properties: { lease_id: { type: "string" } }, required: ["lease_id"] } }
] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: raw = {} } = request.params;
    if (name === "identity_status") return result(leases.status(principal));
    if (name === "identity_acquire") {
      const input = schemas.acquire.parse(raw);
      return result(leases.acquire({
        identity: input.identity,
        provider: input.provider,
        ttlSeconds: input.ttl_seconds,
        principal
      }));
    }
    if (name === "identity_release") {
      const input = schemas.release.parse(raw);
      return result(leases.release({ leaseId: input.lease_id, principal }));
    }
    if (name === "identity_invoke") {
      const input = schemas.invoke.parse(raw);
      const lease = leases.require({ leaseId: input.lease_id, principal });
      return result(await invoke(lease, input.tool_name, input.arguments));
    }
    return result({ code: "UNKNOWN_TOOL", message: "tool is not supported" }, true);
  } catch (error) {
    const code = error instanceof BrokerError ? error.code : "REQUEST_FAILED";
    return result({ code, message: error.message }, true);
  }
});

await server.connect(new StdioServerTransport());
