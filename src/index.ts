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
import {
  printAssistantHeader,
  printMarkdown,
  printStatus,
  printUserMessageStart,
  printUserMessageEnd,
  printUserMessage,
} from './ui/chalk-ui.js';
import { buildSystemPrompt } from './utils/config.js'
import { createAskApproval } from './ui/approval.js'

// Import .env
import 'dotenv/config';

const workspaceRoot = process.cwd()

async function main() {
  console.clear();
  printAssistantHeader();
  console.log();

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

  const systemPrompt = buildSystemPrompt(workspaceRoot);
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

  const context: ToolContext = {
    workspaceRoot,
    askApproval: createAskApproval(rl),
  }

  console.log('Type .exit to quit, .clear to reset context.\n')
  printUserMessageStart()
  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    printUserMessageEnd()
    if (!input) {
      printUserMessageStart()
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
      printUserMessageStart()
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

    printUserMessageStart()
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
