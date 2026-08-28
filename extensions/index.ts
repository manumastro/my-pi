// Pi extensions index
// Loads web_search and web_fetch from @ollama/pi-web-search
// Loads browser automation from pi-agent-browser

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Import extensions from local files (to avoid node_modules resolution issues)
import nullSafeTuiExtension from "./null-safe-tui.ts";
import webSearchExtension from "./web-search.ts";
import agentBrowserExtension from "./browser.ts";
import claudeCodeMultiAccountExtension from "./claude-code-multi-account/index.ts";
// Removed anyrouter compat - not needed for zjapi-claude
// import anyrouterClaudeCodeCompat from "./anyrouter-claude-code-compat/index.ts";

// Load all extensions
export default function (pi: ExtensionAPI) {
  // Patch the shared TUI containers before any tool renders.
  nullSafeTuiExtension(pi);

  // Web search and web fetch (requires local Ollama with web search enabled)
  webSearchExtension(pi);

  // Browser automation (requires agent-browser CLI)
  agentBrowserExtension(pi);

  // Claude Code compatibility layer
  // Commands: /claude-list, /claude-use, /claude-external
  claudeCodeMultiAccountExtension(pi);
  // anyrouterClaudeCodeCompat(pi);
}
