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
import { agentLoop } from './agent-loop.js'
import type { Message, ToolContext } from './types.js'
import {
  printAssistantHeader,
  printStatus,
  printUserMessageStart,
  printUserMessageEnd,
  printAssistantReplyStart,
  printAssistantReplyEnd,
} from './ui/chalk-ui.js'
import { buildSystemPrompt, loadConfig, loadEnv } from './utils/config.js'
import { createAskApproval } from './ui/approval.js'
import { loadMemories } from './utils/memory.js'
import { tryExecuteCommand, type CommandContext } from './repl-commands.js'
import chalk from 'chalk'


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
  printAssistantHeader()
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

  const systemPrompt = buildSystemPrompt(workspaceRoot, memories)
  let messages: Message[] = [
    { role: 'system', content: systemPrompt }
  ]
  // cumulative token count for the session
  let sessionTotalTokens = 0

  // Readline setup
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.gray(`${workspaceRoot} `) + chalk.green('> '),
  })

  const context: ToolContext = {
    workspaceRoot,
    askApproval: createAskApproval(rl),
    config: { ...userConfig, autoApprove: userConfig.autoApprove },
  }

  let isProcessing = false

  const cmdCtx: CommandContext = {
    messages,
    systemPrompt,
    sessionTotalTokens,
    toolContext: context,
    userConfig,
    provider,
    registry,
    workspaceRoot,
    rl,
    isProcessing,
  }

  console.log(
    chalk.cyan('/exit') + chalk.dim(' quit · ') +
    chalk.cyan('/reset') + chalk.dim(' reset · ') +
    chalk.cyan('/info') + chalk.dim(' status · ') +
    chalk.cyan('/auto') + chalk.dim('/') + chalk.cyan('ask') + chalk.dim(' toggle approval mode · ') +
    chalk.cyan('/remember') + chalk.dim(' save memory')
  );
  console.log()
  printUserMessageStart()
  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()

    // If the Agent is processing (including approval), ignore any input
    if (isProcessing) {
      return
    }

    printUserMessageEnd()
    if (!input) {
      printUserMessageStart()
      rl.prompt()
      return
    }

    // Special commands
    const handled = await tryExecuteCommand(input, cmdCtx)
    if (handled) return

    // Normal user message
    messages.push({ role: 'user', content: input })

    isProcessing = true
    try {
      printAssistantReplyStart()
  
      const result = await agentLoop(provider, registry, context, messages)
      // Update messages with the result
      messages = result.updatedMessages
      // Update cumulative token counter
      const turnTokens = result.totalUsage.input + result.totalUsage.output
      sessionTotalTokens += turnTokens

      if (result.terminationReason === 'consecutive_denials') {
        console.log(chalk.yellow('Task stopped because you denied 3 tool calls in a row.'));
      } else if (result.terminationReason === 'max_tool_calls') {
        console.log(chalk.yellow('Task stopped because it reached the tool call limit.'));
      }
      printStatus(sessionTotalTokens, provider.getModelMaxTokens(), provider.getModelName())
      printAssistantReplyEnd()
    } catch (error: any) {
      console.error('System Error:', error.message)
      printAssistantReplyEnd()
    }

    isProcessing = false
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
