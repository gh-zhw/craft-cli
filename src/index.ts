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
import { webSearchTool } from './tools/web-search.js'
import { webFetchTool } from './tools/web-fetch.js'
import { getCurrentTimeTool } from './tools/get-current-time.js'
import { taskSubagentTool } from './tools/task-subagent.js'
import { AgentRuntime } from './agent-runtime.js'
import type { ToolContext, SessionContext } from './types.js'
import {
  printAssistantHeader,
  printUserMessageStart,
  printUserMessageEnd,
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
import { executeAgentTurn } from './execute-turn.js'


const workspaceRoot = process.cwd()

const args = process.argv.slice(2)
let cliMode: 'chat' | 'agent' = 'agent'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode' && args[i + 1]) {
    const val = args[i + 1]
    if (val === 'chat' || val === 'agent') {
      cliMode = val
    } else {
      console.error(`Invalid mode: ${val}. Expected "chat" or "agent".`)
      process.exit(1)
    }
    i++
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
    provider: userConfig.provider ?? 'anthropic',
    baseUrl: userConfig.baseUrl,
    model: userConfig.model,
    thinking: userConfig.thinking,
  })

  // Set up tool registry — agent mode only
  const registry = createToolRegistry()
  if (cliMode === 'agent') {
    registerTool(registry, readFileTool)
    registerTool(registry, writeFileTool)
    registerTool(registry, editFileTool)
    registerTool(registry, runShellTool)
    registerTool(registry, grepTool)
    registerTool(registry, globTool)
    registerTool(registry, addMemoryTool)
    registerTool(registry, webSearchTool)
    registerTool(registry, webFetchTool)
    registerTool(registry, getCurrentTimeTool)
    registerTool(registry, taskSubagentTool)
  }

  const sessionApprovedTools = new Set<string>()    // Session tool whitelist

  const systemPrompt = buildSystemPrompt(workspaceRoot, memories, cliMode)

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
    agentRuntime: undefined,
  }

  // Create AgentRuntime (persistent instance)
  const runtime = new AgentRuntime({
    provider,
    registry,
    toolContext: context,
    systemPrompt,
    config: userConfig,
    sessionApprovedTools,
    initialMessages: [],
    agentName: 'main'
  })

  // Register UI event
  runtime.on('text', (chunk) => printStreamingText(chunk))
  runtime.on('toolStart', (name, args) => printToolCallStart(name, args))
  runtime.on('toolEnd', (name, result, error) => printToolCallEnd(name, result, error))
  runtime.on('streamFinished', () => finishStream())
  runtime.on('terminated', (reason) => {
    if (reason === 'max_tokens') {
      console.log(chalk.red('Reply truncated (max tokens reached).'))
    } else if (reason === 'consecutive_denials') {
      console.log(chalk.red('Reply stopped because you denied tool calls.'))
    } else if (reason === 'max_tool_calls') {
      console.log(chalk.red('Reply stopped because it reached the tool call limit.'))
    } else if (reason === 'user_stop') {
      // console.log(chalk.red('Reply stopped by user.'))
    }
  })
  runtime.on('contextCompacted', (details) => {
    const contextTokens = details.contextTokens
    const limit = details.limit
    const pct = (contextTokens / limit) * 100
    console.log(
      chalk.yellow(
        `Context compacted: now ${contextTokens} / ${limit} tokens (${pct.toFixed(1)}%).`
      )
    )
  })

  const sessionCtx: SessionContext = {
    runtime,
    sessionTotalInputTokens: 0,
    sessionTotalOutputTokens: 0,
    sessionApprovedTools,
    userConfig,
    workspaceRoot,
    rl,
    isProcessing: false,
    mode: cliMode,
  }

  printUserMessageStart()
  rl.prompt()

  rl.on('line', async (line) => {
    // If the Agent is processing (including approval), ignore any input
    if (sessionCtx.isProcessing) {
      return
    }

    const input = line.trim()

    if (!input) {
      rl.prompt()
      return
    }

    // Special commands
    const handled = await tryExecuteCommand(input, sessionCtx)
    if (handled) return

    printUserMessageEnd()
    await executeAgentTurn(input, sessionCtx)
  })

  rl.on('close', () => {
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
