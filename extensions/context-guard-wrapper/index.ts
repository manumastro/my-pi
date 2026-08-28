/**
 * context-guard wrapper — Browser-aware context window protection.
 * 
 * This wrapper extends pi-mono-context-guard with browser awareness:
 * - Binary/image reads are blocked up front so they never reach context-saver
 * - Uses a marker file to communicate browser state for browser-specific rules
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Browser state marker
// ---------------------------------------------------------------------------
const BROWSER_MARKER_PATH = "/tmp/pi-browser-active";

export function setBrowserActive() {
  try {
    writeFileSync(BROWSER_MARKER_PATH, "1");
  } catch {}
}

export function setBrowserInactive() {
  try {
    writeFileSync(BROWSER_MARKER_PATH, "0");
  } catch {}
}

function isBrowserActive(): boolean {
  try {
    if (!existsSync(BROWSER_MARKER_PATH)) return false;
    const content = readFileSync(BROWSER_MARKER_PATH, "utf8").trim();
    return content === "1";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  readLimit: 120,
  rgHeadLimit: 60,
  readGuard: true,
  dedupGuard: true,
  rgGuard: true,
  // Patterns excluded from read guard
  excludePatterns: ["\\.png$", "\\.jpg$", "\\.jpeg$", "\\.gif$", "\\.webp$", "screenshot", "sandbox"],
};

type Config = typeof DEFAULTS;

// ---------------------------------------------------------------------------
// Read dedup cache
// ---------------------------------------------------------------------------

type ReadEntry = {
  mtimeMs: number;
  offset: number | undefined;
  limit: number | undefined;
};

const FILE_UNCHANGED_STUB =
  "File unchanged since last read. The content from the earlier Read " +
  "tool_result in this conversation is still current — refer to that " +
  "instead of re-reading.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesExcludePattern(path: string, patterns: string[]): boolean {
  const lowerPath = path.toLowerCase();
  return patterns.some((p) => lowerPath.includes(p.toLowerCase()) || new RegExp(p, "i").test(path));
}

function usesUnboundedRg(cmd: string): boolean {
  if (!/(?:^|[|;&\s])rg\s/.test(cmd)) return false;
  if (/\|\s*(?:head|tail|wc|less|more|grep\s+-c)/.test(cmd)) return false;
  if (/\brg\b[^|]*\s(?:-l|--files-with-matches|-c|--count|--json)\b/.test(cmd)) return false;
  return true;
}

function appendHead(cmd: string, n: number): string {
  return `${cmd.trimEnd().replace(/;+$/, "").trimEnd()} | head -${n}`;
}

function isLikelyBinaryReadPath(rawPath: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico|avif|tiff?)$/i.test(rawPath) ||
    rawPath.toLowerCase().includes("screenshot") ||
    rawPath.toLowerCase().includes("sandbox");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  const cfg: Config = { ...DEFAULTS };

  const readCache = new Map<string, ReadEntry>();

  // Invalidate cache on file modification
  pi.events.on("context-guard:file-modified", (data: { path: string }) => {
    if (data?.path) {
      readCache.delete(resolve(data.path));
    }
  });

  // Reset cache on new session
  pi.on("session_start", async () => {
    readCache.clear();
  });

  // Intercept browser tool to track browser state
  pi.on("tool_call", async (event) => {
    if (isToolCallEventType("browser", event)) {
      const cmd = event.input.command ?? "";
      
      // Browser commands that indicate browser is being used
      if (cmd.startsWith("open") || cmd.startsWith("snapshot") || 
          cmd.startsWith("click") || cmd.startsWith("fill") ||
          cmd.startsWith("type") || cmd.startsWith("screenshot") ||
          cmd.startsWith("scroll") || cmd.startsWith("select") ||
          cmd.startsWith("press") || cmd.startsWith("wait")) {
        setBrowserActive();
      }
      
      // Browser closed
      if (cmd.startsWith("close")) {
        setBrowserInactive();
      }
    }
  });

  // Guard 1 + 2: read — limit injection + dedup
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("read", event)) return;

    const rawPath = event.input.path ?? "";
    
    // Check exclude patterns
    if (matchesExcludePattern(rawPath, cfg.excludePatterns)) {
      return;
    }

    // Never let binary/image reads reach context-saver: mark them so the result bypasses sandboxing.
    if (isLikelyBinaryReadPath(rawPath)) {
      (event.input as Record<string, unknown>).__pi_context_saver_skip = true;
      return;
    }

    // Browser-aware state is still tracked for future use, but does not change text reads here.

    // Guard 1: inject limit if missing
    if (cfg.readGuard && event.input.limit === undefined) {
      event.input.limit = cfg.readLimit;
      ctx.ui.notify(
        `[context-guard] read: auto-limit=${cfg.readLimit} (use offset to paginate)`,
        "info",
      );
    }

    // Guard 2: dedup
    if (!cfg.dedupGuard) return;
    if (!rawPath) return;

    const absolutePath = resolve(
      ctx.cwd,
      rawPath.startsWith("@") ? rawPath.slice(1) : rawPath,
    );

    const entry = readCache.get(absolutePath);
    if (!entry) return;

    const sameOffset = entry.offset === (event.input.offset ?? undefined);
    const sameLimit  = entry.limit  === (event.input.limit  ?? undefined);
    if (!sameOffset || !sameLimit) return;

    try {
      const { mtimeMs } = await stat(absolutePath);
      if (mtimeMs !== entry.mtimeMs) {
        readCache.delete(absolutePath);
        return;
      }
    } catch {
      readCache.delete(absolutePath);
      return;
    }

    ctx.ui.notify(`[context-guard] read dedup: ${rawPath} unchanged`, "info");
    return {
      block: true,
      reason: FILE_UNCHANGED_STUB,
    };
  });

  // Populate cache after successful read
  pi.on("tool_result", async (event) => {
    if (!cfg.dedupGuard) return;
    if (event.toolName !== "read") return;
    if (event.isError) return;

    const rawPath = (event.input as { path?: string }).path;
    if (!rawPath) return;

    // Skip binary files
    const resultText = event.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (resultText === FILE_UNCHANGED_STUB) return;

    // Skip likely binary files from cache
    if (/\.(png|jpg|jpeg|gif|webp|pdf|bin)$/i.test(rawPath) ||
        rawPath.toLowerCase().includes("screenshot")) {
      return;
    }

    const absolutePath = resolve(
      (event.input as { cwd?: string }).cwd ?? "",
      rawPath.startsWith("@") ? rawPath.slice(1) : rawPath,
    );

    try {
      const { mtimeMs } = await stat(absolutePath);
      readCache.set(absolutePath, {
        mtimeMs,
        offset: (event.input as { offset?: number }).offset ?? undefined,
        limit:  (event.input as { limit?: number }).limit   ?? undefined,
      });
    } catch {}
  });

  // Guard 3: bash — rg without head/tail/wc
  pi.on("tool_call", async (event, ctx) => {
    if (!cfg.rgGuard) return;
    if (!isToolCallEventType("bash", event)) return;

    const cmd = event.input.command ?? "";
    if (usesUnboundedRg(cmd)) {
      event.input.command = appendHead(cmd, cfg.rgHeadLimit);
      ctx.ui.notify(
        `[context-guard] bash: appended | head -${cfg.rgHeadLimit} to rg`,
        "info",
      );
    }
  });
}
