#!/usr/bin/env node
import path from "node:path";
import { loadConfig } from "../src/broker.js";
import { evaluateIdentityBoundary } from "../src/identity-boundary-eval.js";

const args = process.argv.slice(2);
const flag = args.indexOf("--identity-config");
const configPath = flag >= 0 ? args[flag + 1] : args.find((arg) => !arg.startsWith("-"));
if (!configPath) {
  throw new Error("usage: npm run eval:identity-boundary -- .\\identity-broker.json");
}

const config = await loadConfig(path.resolve(configPath));
const report = evaluateIdentityBoundary(config);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed ? 0 : 1;
