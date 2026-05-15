// src/index.ts
import * as readline from 'node:readline'
import { LLMProvider } from './llm/provider.js'
import { createToolRegistry, registerTool } from './tools/registry.js'
import { readFileTool } from './tools/read-file.js'
import { writeFileTool } from './tools/write-file.js'
import { editFileTool } from './tools/edit-file.js'
import { runShellTool } from './tools/run-shell.js'
import { grepTool } from './tools/grep.js'
import { globTool } from './tools/glob.js'
import { addMemoryTool } from './tools/add-memory.js'
import { webSearchTool } from './tools/web-search.js';
import { webFetchTool } from './tools/web-fetch.js';
import { AgentRuntime } from './agent-runtime.js'
import type { ToolContext, SessionContext } from './types.js'
import {
  printAssistantHeader,
  printStatus,
  printUserMessageStart,
  printUserMessageEnd,
  printAssistantReplyStart,
  printAssistantReplyEnd,
  printStreamingText,
  printToolCallStart,
  printToolCallEnd,
  finishStream,
} from './ui/chalk-ui.js'
import { loadConfig, loadEnv } from './utils/config.js'
import { createAskApproval } from './ui/approval.js'
import { loadMemories } from './utils/memory.js'
import { tryExecuteCommand } from './repl-commands.js'
import chalk from 'chalk'
import { buildSystemPrompt } from './utils/prompts.js'


const workspaceRoot = process.cwd()

const args = process.argv.slice(2);
let cliProvider: string | undefined;
let cliModel: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' && args[i + 1]) {
    cliProvider = args[i + 1];
    i++;
  } else if (args[i] === '--model' && args[i + 1]) {
    cliModel = args[i + 1];
    i++;
  }
}

async function main() {
  console.clear()
  printAssistantHeader('v1.0.0', workspaceRoot)
  console.log()

  // Load user configuration (Model priority: options > config > env > default)
  loadEnv(workspaceRoot)
  const userConfig = loadConfig(workspaceRoot)

  const memories = loadMemories(workspaceRoot)

  // Initialize LLM provider
  const provider = new LLMProvider({
    provider: (cliProvider as any) ?? userConfig.provider ?? 'anthropic',
    baseUrl: userConfig.baseUrl,
    model: cliModel ?? userConfig.model,
    thinking: userConfig.thinking,
  })

  // Set up tool registry
  const registry = createToolRegistry()
  registerTool(registry, readFileTool)
  registerTool(registry, writeFileTool)
  registerTool(registry, editFileTool)
  registerTool(registry, runShellTool)
  registerTool(registry, grepTool)
  registerTool(registry, globTool)
  registerTool(registry, addMemoryTool)
  registerTool(registry, webSearchTool)
  registerTool(registry, webFetchTool)
  
  const sessionApprovedTools = new Set<string>();    // Session tool whitelist

  const systemPrompt = buildSystemPrompt(workspaceRoot, memories)

  // Readline setup
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('> '),
  })

  const context: ToolContext = {
    workspaceRoot,
    askApproval: createAskApproval(rl),
    config: { ...userConfig, autoApprove: userConfig.autoApprove },
  }

  // Create AgentRuntime (persistent instance)
  const runtime = new AgentRuntime({
    provider,
    registry,
    toolContext: context,
    systemPrompt,
    config: userConfig,
    initialMessages: [],
  });

  // Register UI event
  runtime.on('text', (chunk) => printStreamingText(chunk));
  runtime.on('toolStart', (name, args) => printToolCallStart(name, args));
  runtime.on('toolEnd', (name, result, error) => printToolCallEnd(name, result, error));
  runtime.on('streamFinished', () => finishStream());

  const sessionCtx: SessionContext = {
    runtime,
    messages: runtime.getMessages(),
    systemPrompt,
    sessionTotalTokens: 0,
    toolContext: context,
    sessionApprovedTools,
    userConfig,
    provider,
    registry,
    workspaceRoot,
    rl,
    isProcessing: false,
  }

  printUserMessageStart()
  rl.prompt()

  rl.on('line', async (line) => {
    // If the Agent is processing (including approval), ignore any input
    if (sessionCtx.isProcessing) {
      return
    }

    const input = line.trim()

    printUserMessageEnd()
    if (!input) {
      printUserMessageStart()
      rl.prompt()
      return
    }

    // Special commands
    const handled = await tryExecuteCommand(input, sessionCtx)
    if (handled) return

    sessionCtx.isProcessing = true
    try {
      printAssistantReplyStart()
  
      const result = await runtime.run(input)
      // Update messages with the result
      sessionCtx.messages = result.updatedMessages
      // Update cumulative token counter
      const turnTokens = result.totalUsage.input + result.totalUsage.output
      sessionCtx.sessionTotalTokens += turnTokens

      if (result.terminationReason === 'consecutive_denials') {
        console.log(chalk.yellow('Reply stopped because you denied tool calls.'));
      } else if (result.terminationReason === 'max_tool_calls') {
        console.log(chalk.yellow('Reply stopped because it reached the tool call limit.'));
      }
      printStatus(sessionCtx.sessionTotalTokens, provider.getModelMaxTokens(), provider.getModelName())
      printAssistantReplyEnd()
    } catch (error: any) {
      console.error('System Error:', error.message)
      printAssistantReplyEnd()
    }

    sessionCtx.isProcessing = false
    printUserMessageStart()
    rl.prompt()
  })

  rl.on('close', () => {
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
