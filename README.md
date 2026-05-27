# Craft CLI

Hand-crafted agent in your terminal.

Craft is a personal assistant that runs directly in your terminal. It can read, write, and edit files, execute shell commands, search website, and more — all driven by an LLM.

## Getting Started

### 1. Clone and install
```bash
git clone <repo-url> craft-cli
cd craft-cli
npm install
npm link
```

### 2. Configure your workspace
In the root of any project you want to work in, create a ```.craft/.env``` file with your API keys:

```text
ANTHROPIC_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key
```

### 3. Run Craft
```bash
craft [--mode chat|agent]
```
Defaults to `agent` mode with full tool access. Use `--mode chat` for a lightweight chat-only session with no tools.
On first run, Craft will automatically create default configuration files in ```.craft/``` directory:

- ```AGENT.md``` – the agent’s system prompt (edit to customise behaviour)

- ```config.json``` – persistent settings

- ```MEMORIES.md``` – cross‑session memories

You can also create or modify these files manually at any time.


## Features
- Interactive REPL with streaming Markdown output

- Eleven built-in tools: read/write/edit files, shell execution, grep, glob, add memory, search/fetch website, get current time, create parallel subagents.

- Smart permission system (auto / confirm / warn)

- Project‑local configuration and persistent memory

## Commands
| Command | Description |
|---------|-------------|
| `/exit` | Quit the REPL |
| `/reset` | Reload config/prompt and reset the conversation |
| `/info` | Display session information (e.g., current model name, token usage) |
| `/mode <chat\|agent>` | Switch between chat mode (no tools) and agent mode (full tools) |
| `/auto` | Toggle auto‑approve mode for this session |
| `/compact` | Compact context |
| `/remember <text>` | Save a memory for future sessions |
| `/task <description>` | Execute a complex task using Plan → Execute → Reflect → Revise methodology |

## Configuration
Edit ```.craft/config.json``` to set a default model, toggle auto‑approval globally, and more. (ps. subagents.defaultMaxTimeSeconds is not supported for now)

```json
{
  "provider": "anthropic",
  "baseUrl": "https://api.deepseek.com/anthropic",
  "model": "deepseek-v4-flash",
  "thinking": {
    "enabled": true,
    "strength": "medium"
  },
  "autoApprove": false,
  "autoApproveSafeCommands": true,
  "outputStyle": "stream",
  "maxConsecutiveDenials": 3,
  "maxToolCallsPerTurn": 15,
  "contextCompression": {
    "enabled": true,
    "lightTrimThreshold": 0.8,
    "deepCompactThreshold": 0.9,
    "keepRecentTurns": 5,
    "summaryMaxTokens": 1500
  },
  "subagents": {
    "maxParallel": 5,
    "defaultMaxTimeSeconds": 60,
    "defaultMaxToolCalls": 15,
    "verbose": false
  }
}
```

## License
MIT