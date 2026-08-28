#!/usr/bin/env node
/**
 * Resolve the global Pi CLI entry (avoids ~/.pi/agent/pi.cmd wrapper loop on Windows).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@mariozechner/pi-coding-agent",
];

function npmGlobalRoot() {
  const r = spawnSync("npm", ["root", "-g"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) return null;
  const root = (r.stdout ?? "").trim();
  return root || null;
}

function cliForPackage(globalRoot, pkg) {
  const cli = join(globalRoot, pkg, "dist", "cli.js");
  return existsSync(cli) ? cli : null;
}

export function resolvePiCli() {
  const globalRoot = npmGlobalRoot();
  if (!globalRoot) return null;
  for (const pkg of PACKAGES) {
    const cli = cliForPackage(globalRoot, pkg);
    if (cli) return cli;
  }
  return null;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const cli = resolvePiCli();
  if (!cli) process.exit(1);
  process.stdout.write(cli);
}