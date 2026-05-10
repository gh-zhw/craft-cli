# Craft CLI

Hand-crafted agent in your terminal.

Craft is a personal coding assistant that runs directly in your terminal. It can read, write, and edit files, execute shell commands, search code, and more — all driven by an LLM.

## Getting Started

### 1. Clone and install
```bash
git clone <repo-url> craft-cli
cd craft-cli
npm install
npm link
```

### 2. Configure your workspace
In the root of any project you want to work in, create a ```.craft/.env``` file with your API credentials:

```text
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_API_KEY=your-api-key
```

### 3. Run Craft
```bash
craft
```
On first run, Craft will automatically create default configuration files in ```.craft/``` directory:

- ```AGENT.md``` – the agent’s system prompt (edit to customise behaviour)

- ```config.json``` – persistent settings

- ```MEMORIES.md``` – cross‑session memories

You can also create or modify these files manually at any time.


## Features
- Interactive REPL with streaming Markdown output

- Six built-in tools: read/write/edit files, shell execution, grep, and glob

- Smart permission system (auto / confirm / warn)

- Project‑local configuration and persistent memory

## Commands
| Command | Description |
|---------|-------------|
| `/exit` | Quit the REPL |
| `/reset` | Reset the conversation context |
| `/auto` | Enable automatic approval for the current session |
| `/ask` | Restore interactive approval |
| `/remember <text>` | Save a memory for future sessions |

## Configuration
Edit ```.craft/config.json``` to set a default model, toggle auto‑approval globally, and more.

```json
{
  "defaultModel": "claude-sonnet-4-20250514",
  "autoApprove": false,
  "autoApproveSafeCommands": true,
  "outputStyle": "markdown"
}
```

## License
MIT