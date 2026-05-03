// src/index.ts
import * as readline from 'node:readline';
import { LLMProvider } from './llm/provider.js'
import { createToolRegistry, registerTool } from './tools/registry.js'
import { readFileTool } from './tools/read-file.js'
import { writeFileTool } from './tools/write-file.js'
import { editFileTool } from './tools/edit-file.js';
import { runShellTool } from './tools/run-shell.js';
import { grepTool } from './tools/grep.js';
import { globTool } from './tools/glob.js';
import { agentLoop } from './agent-loop.js'
import type { Message, ToolContext } from './types.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  printAssistantHeader,
  printMarkdown,
  printConfirm,
  printStatus,
} from './ui/chalk-ui.js';

// Import .env
import 'dotenv/config';

const workspaceRoot = process.cwd()

// Auto-approval for now
const autoApprove: ToolContext['askApproval'] = async (msg: string) => {
  printConfirm(msg);
  return true;
};

const context: ToolContext = {
  workspaceRoot,
  askApproval: autoApprove,
};

// System prompt: combine AGENT.md (if exists) with base instructions
function loadSystemPrompt(): string {
  const agentMdPath = join(workspaceRoot, 'AGENT.md')
  let projectPrompt = ''
  if (existsSync(agentMdPath)) {
    projectPrompt = readFileSync(agentMdPath, 'utf-8').trim()
  }
  const basePrompt = `You are craft-cli, a precise terminal assistant. You have access to tools for reading, writing, editing files, running shell commands, searching with grep, and finding files with glob.
- Always use relative paths from the workspace root.
- When editing files, ensure the old_string is unique.
- Prefer safe commands, never execute dangerous ones.
- Be concise and helpful.`

  if (projectPrompt) {
    return `${basePrompt}\n\nProject instructions (from AGENT.md):\n${projectPrompt}`
  }
  return basePrompt
}

async function main() {
  console.clear();
  printAssistantHeader();
  console.log(); // blank line

  // Initialize LLM provider (reads ANTHROPIC_API_KEY from env)
  const provider = new LLMProvider({
    thinking: {type: 'disabled'},
  })

  // Set up tool registry
  const registry = createToolRegistry()
  registerTool(registry, readFileTool)
  registerTool(registry, writeFileTool)
  registerTool(registry, editFileTool)
  registerTool(registry, runShellTool)
  registerTool(registry, grepTool)
  registerTool(registry, globTool)

  const systemPrompt = loadSystemPrompt()
  let messages: Message[] = [
    { role: 'system', content: systemPrompt }
  ]
  // cumulative token count for the session
  let sessionTotalTokens = 0;

  // Readline setup
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\u001b[32m> \u001b[39m', // green prompt
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    // Special commands
    if (input === '.exit' || input === 'exit') {
      process.exit(0)
    }
    if (input === '.clear') {
      messages.length = 0
      messages = [{ role: 'system', content: systemPrompt }]
      sessionTotalTokens = 0
      console.clear()
      printAssistantHeader();
      rl.prompt()
      return
    }

    // Normal user message
    messages.push({ role: 'user', content: input });

    try {
      const result = await agentLoop(provider, registry, context, messages)
      // Update messages with the result
      messages = result.updatedMessages;
      // Update cumulative token counter
      const turnTokens = result.totalUsage.input + result.totalUsage.output;
      sessionTotalTokens += turnTokens;
      printStatus(sessionTotalTokens);
    } catch (error: any) {
      console.error('Error:', error.message);
    }

    console.log()
    rl.prompt();
  })

  rl.on('close', () => {
    process.exit(0);
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
