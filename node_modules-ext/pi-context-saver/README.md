# 🧠 pi-context-saver

A Pi extension that prevents context window bloat by automatically sandboxing heavy tool outputs.

[![Pi Package](https://img.shields.io/badge/pi-package-blue)](https://pi.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem

Every tool call dumps raw data into your context window:
- A web search result can be 50KB+
- A bash command output can be 100KB+
- Fetching URLs can return massive pages
- Reading large files consumes thousands of tokens

After 30 minutes of coding, 40% of your context window is gone to data you'll never reference again.

## Solution

**pi-context-saver** intercepts heavy tool results and automatically sandbox outputs that exceed a configurable threshold (default: 10KB). Instead of dumping raw data into your context, it:

1. ✅ Saves the full output to a temp file
2. ✅ Returns a summary with preview + file location
3. ✅ Provides a tool (`ctx_read_sandbox`) to retrieve full content when needed
4. ✅ Tracks context savings statistics

## Installation

```bash
pi install npm:pi-context-saver
```

Or install directly from GitHub:

```bash
pi install git:github.com/HyperspaceNG/pi-context-saver
```

## Usage

Once installed, the extension works **automatically**. Heavy outputs are intercepted and sandboxed without any manual intervention.

### Commands

| Command | Description |
|---------|-------------|
| `/ctx-stats` | Show context savings statistics |
| `/ctx-doctor` | Diagnose extension status |
| `/ctx-threshold <size>` | Set general sandboxing threshold (e.g., `5KB`, `1MB`) |
| `/ctx-read-threshold <size>` | Set file read threshold (default: 50KB) |
| `/ctx-enable` | Enable sandboxing |
| `/ctx-disable` | Disable sandboxing |
| `/ctx-reset` | Reset all statistics |

### Tools

| Tool | Description |
|------|-------------|
| `ctx_read_sandbox` | Read full content from sandbox file (use `offset` and `limit` params) |

## Example Output

When a tool produces output > threshold, you'll see:

```
[Content sandboxed: 56.3KB over 1,247 lines]

Reason: Output exceeded threshold (56.3KB > 10KB)
Full output saved to: /Users/you/.pi/agent/context-saver/sandbox-bash-12345.txt

Preview (first 5 lines):
Line 1
Line 2
Line 3
Line 4
Line 5

... (1,242 more lines)
```

To read the full content later:
```
ctx_read_sandbox("/Users/you/.pi/agent/context-saver/sandbox-bash-12345.txt")
```

## Monitored Tools

- `bash` - Command output (threshold: 10KB)
- `web_search` - Search results (threshold: 10KB)
- `fetch_content` - Web page content (threshold: 10KB)
- `exa_search` - Exa search results (threshold: 10KB)
- `read` - File reads (threshold: 50KB - higher for files that need larger previews)

## Configuration

Data is stored in `~/.pi/agent/context-saver/`:
- `stats.json` - Usage statistics
- `access.log` - Sandboxing events log
- `sandbox-*.txt` - Sandboxed output files

### Dual Threshold System

- **General threshold** (10KB): Applied to bash, web_search, fetch_content, exa_search
- **Read file threshold** (50KB): Applied to read tool (higher because files often need larger previews)

Adjust thresholds with:
```
/ctx-threshold 20KB
/ctx-read-threshold 100KB
```

## Statistics

View your context savings:
```
/ctx-stats

📊 Context Saver Statistics

Status: ✅ Enabled
General threshold: 10.0KB
Read file threshold: 50.0KB
Sessions tracked: 15
Total calls intercepted: 342
Total context saved: 4.2MB

Per-tool breakdown:
  • bash:
    Calls: 156, Sandboxed: 89
    Savings: 2.1MB
  • web_search:
    Calls: 98, Sandboxed: 67
    Savings: 1.8MB
  • read:
    Calls: 88, Sandboxed: 23
    Savings: 345.6KB
```

## Similar Projects

- [context-mode](https://github.com/mksglu/context-mode) - Multi-platform context management (Claude Code, Gemini, Cursor, etc.)
- [pi-context](https://www.npmjs.com/package/pi-context) - Git-like context management for Pi

## License

MIT © HyperspaceNG
