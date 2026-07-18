#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function requiredFlag(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`missing required ${name}`);
  return value;
}

function optionalFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function resolveReference(value, label) {
  const match = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(value || "");
  if (!match) throw new Error(`${label} must be an environment-variable reference`);
  return match[1];
}

function resolveGh() {
  if (process.platform !== "win32") return "gh";
  const candidates = [
    "C:\\Program Files\\GitHub CLI\\gh.exe",
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "GitHub CLI", "gh.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "GitHub CLI", "gh.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "gh";
}

const configPath = path.resolve(requiredFlag("--config"));
const githubUser = requiredFlag("--github-user");
const principal = requiredFlag("--principal");
const identity = requiredFlag("--identity");
const providerName = optionalFlag("--provider", "github");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const provider = config.identities?.[identity]?.providers?.[providerName];
if (!provider) throw new Error(`provider '${providerName}' is not configured for identity '${identity}'`);

const tokenVariable = resolveReference(provider.env?.GITHUB_PERSONAL_ACCESS_TOKEN, "GITHUB_PERSONAL_ACCESS_TOKEN");
const toolsVariable = provider.env?.GITHUB_TOOLS
  ? resolveReference(provider.env.GITHUB_TOOLS, "GITHUB_TOOLS")
  : null;
const principalVariable = config.principal_env || "IDENTITY_BROKER_PRINCIPAL";

const token = execFileSync(resolveGh(), ["auth", "token", "--hostname", "github.com", "--user", githubUser], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  env: process.env
}).trim();
if (!token) throw new Error(`no stored GitHub credential found for ${githubUser}`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const childEnv = {
  ...process.env,
  [principalVariable]: principal,
  [tokenVariable]: token,
  ...(toolsVariable ? { [toolsVariable]: provider.allowed_tools.join(",") } : {})
};
const child = spawn(process.execPath, [path.join(root, "src", "server.js"), "--config", configPath], {
  env: childEnv,
  stdio: "inherit",
  windowsHide: true
});

child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
