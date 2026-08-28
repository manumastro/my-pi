#!/usr/bin/env node
/**
 * Installa e avvia Podman su Windows (winget + podman machine).
 * Chiamato automaticamente da deploy-cpa.mjs al pull su win32.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PODMAN_ID = "RedHat.Podman";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    shell: true,
    stdio: opts.silent ? "pipe" : "inherit",
    ...opts,
  });
}

function podmanCandidates() {
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const local = process.env.LOCALAPPDATA ?? "";
  return [
    "podman",
    join(pf, "RedHat", "Podman", "podman.exe"),
    join(local, "Programs", "RedHat", "Podman", "podman.exe"),
    join(local, "Programs", "Podman", "podman.exe"),
  ].filter(Boolean);
}

export function resolvePodmanBin() {
  for (const bin of podmanCandidates()) {
    if (bin !== "podman" && !existsSync(bin)) continue;
    const r = run(bin, ["--version"], { silent: true });
    if (r.status === 0) return bin;
  }
  return null;
}

function hasWinget() {
  return run("winget", ["--version"], { silent: true }).status === 0;
}

function installViaWinget() {
  if (!hasWinget()) {
    console.log(
      "  winget non trovato. Installa Podman manualmente:\n" +
        "    winget install -e --id RedHat.Podman\n" +
        "  oppure scarica da https://podman.io/docs/installation",
    );
    return false;
  }
  console.log("==> Install Podman (winget RedHat.Podman)…");
  const r = run("winget", [
    "install",
    "-e",
    "--id",
    PODMAN_ID,
    "--accept-package-agreements",
    "--accept-source-agreements",
  ]);
  return r.status === 0;
}

function machineRunning(bin) {
  const r = run(bin, ["machine", "list", "--format", "{{.Running}}"], {
    silent: true,
  });
  return (r.stdout ?? "").split("\n").some((l) => l.trim() === "true");
}

function ensureMachine(bin) {
  const list = run(bin, ["machine", "list", "--format", "{{.Name}}"], {
    silent: true,
  });
  const names = (list.stdout ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (names.length === 0) {
    console.log("==> podman machine init");
    const init = run(bin, ["machine", "init"]);
    if (init.status !== 0) return false;
  }

  if (!machineRunning(bin)) {
    console.log("==> podman machine start");
    const start = run(bin, ["machine", "start"]);
    if (start.status !== 0) return false;
  }
  return true;
}

/** @returns {string|null} podman binary path */
export function ensurePodmanWindows({ install = true } = {}) {
  if (process.platform !== "win32") return null;

  let bin = resolvePodmanBin();
  if (!bin && install) {
    if (!installViaWinget()) return null;
    bin = resolvePodmanBin();
  }
  if (!bin) return null;

  const info = run(bin, ["info"], { silent: true });
  if (info.status !== 0) {
    if (!ensureMachine(bin)) return null;
  }

  if (run(bin, ["info"], { silent: true }).status !== 0) {
    console.log("  WARN: podman info fallito dopo machine start");
    return null;
  }

  console.log(`  Podman OK (${bin})`);
  return bin;
}

if (process.argv[1]?.endsWith("install-podman-windows.mjs")) {
  const ok = ensurePodmanWindows({ install: true });
  process.exit(ok ? 0 : 1);
}