// src/repl-commands.ts
import type { SessionContext } from './types.js'
import { addMemory, loadMemories } from './utils/memory.js'
import { printSessionInfo, printUserMessageEnd } from './ui/chalk-ui.js'
import { printAssistantHeader, printUserMessageStart } from './ui/chalk-ui.js'
import { buildSystemPrompt, buildTaskPrompt } from './utils/prompts.js'
import { loadConfig } from './utils/config.js'
import { registerTool } from './tools/registry.js'
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
import chalk from 'chalk'
import { executeAgentTurn } from './execute-turn.js'


export interface ReplCommand {
  name: string
  description?: string
  execute: (input: string, ctx: SessionContext) => Promise<void> | void
}

/** Registry of all available REPL commands. */
const commands: Map<string, ReplCommand> = new Map()

/**
 * Register a command. Throws if the command already exists.
 */
export function registerCommand(cmd: ReplCommand): void {
  if (commands.has(cmd.name)) {
    throw new Error(`Command "${cmd.name}" is already registered.`)
  }
  commands.set(cmd.name, cmd)
}

/**
 * Try to match the input against a registered command.
 * Returns true if a command handled the input, false otherwise.
 */
export async function tryExecuteCommand(input: string, ctx: SessionContext): Promise<boolean> {
  const trimmed = input.trimEnd()
  // direct match (e.g., /exit, /info)
  if (commands.has(trimmed)) {
    await commands.get(trimmed)!.execute(trimmed, ctx)
    return true
  }
  // match against commands that accept arguments (like /remember <text>)
  for (const [name, cmd] of commands.entries()) {
    if (name.endsWith(' ') && trimmed.startsWith(name)) {
      await cmd.execute(trimmed, ctx)
      return true
    }
  }
  return false
}

// Built‑in commands

registerCommand({
  name: '/exit',
  description: 'Exit the REPL',
  execute: () => process.exit(0),
})

registerCommand({
  name: '/reset',
  description: 'Reload config/prompt and reset session',
  execute: (_input, ctx) => {
    // Hot reload config from disk
    const freshConfig = loadConfig(ctx.workspaceRoot)
    ctx.userConfig = freshConfig
    ctx.toolContext.config = { ...freshConfig, autoApprove: freshConfig.autoApprove }

    // Hot reload memories and rebuild system prompt
    const memories = loadMemories(ctx.workspaceRoot)
    ctx.systemPrompt = buildSystemPrompt(ctx.workspaceRoot, memories, ctx.mode)

    // Push updated config to runtime and reset conversation
    ctx.runtime.updateConfig(freshConfig)
    ctx.runtime.reset(ctx.systemPrompt)

    ctx.messages = ctx.runtime.getMessages()
    ctx.sessionApprovedTools.clear()
    ctx.sessionTotalInputTokens = 0
    ctx.sessionTotalOutputTokens = 0
    console.clear()
    printAssistantHeader('v1.0.0', ctx.workspaceRoot)
    printUserMessageStart()
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/remember ',
  description: 'Save a memory for future sessions',
  execute: (input, ctx) => {
    const memContent = input.slice('/remember '.length).trim()
    if (!memContent) {
      console.log(chalk.yellow('Usage: /remember <memory>'))
      ctx.rl.prompt()
      return
    }
    addMemory(ctx.workspaceRoot, memContent)
    console.log(chalk.gray('Memory saved.'))
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/auto',
  description: 'Toggle auto‑approve mode for this session',
  execute: (_input, ctx) => {
    const current = ctx.toolContext.config.autoApprove
    ctx.toolContext.config.autoApprove = !current
    if (ctx.toolContext.config.autoApprove) {
      console.log(chalk.green('Auto-approve mode ON'))
    } else {
      console.log(chalk.yellow('Auto-approve mode OFF'))
    }
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/info',
  description: 'Display session information',
  execute: (_input, ctx) => {
    printSessionInfo({
      provider: ctx.provider.getProviderName(),
      baseurl: ctx.provider.getBaseUrl(),
      model: ctx.provider.getModelName(),
      inputTokensUsed: ctx.sessionTotalInputTokens,
      outputTokensUsed: ctx.sessionTotalOutputTokens,
      currentContext: ctx.runtime.getContextTokens(),
      contextLimit: ctx.provider.getModelMaxTokens(),
      workspace: ctx.workspaceRoot,
      toolsCount: ctx.registry.size,
      autoApprove: ctx.toolContext.config.autoApprove ?? false,
      messagesCount: ctx.messages.length,
      mode: ctx.mode,
    })
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/mode ',
  description: 'Switch between chat and agent mode',
  execute: (input, ctx) => {
    const modeArg = input.slice('/mode '.length).trim()
    if (modeArg !== 'chat' && modeArg !== 'agent') {
      console.log(chalk.yellow('Usage: /mode <chat|agent>'))
      ctx.rl.prompt()
      return
    }

    if (ctx.mode === modeArg) {
      console.log(chalk.gray(`Already in ${modeArg} mode.`))
      ctx.rl.prompt()
      return
    }

    ctx.mode = modeArg

    // Rebuild tool registry
    ctx.registry.clear()
    if (modeArg === 'agent') {
      registerTool(ctx.registry, readFileTool)
      registerTool(ctx.registry, writeFileTool)
      registerTool(ctx.registry, editFileTool)
      registerTool(ctx.registry, runShellTool)
      registerTool(ctx.registry, grepTool)
      registerTool(ctx.registry, globTool)
      registerTool(ctx.registry, addMemoryTool)
      registerTool(ctx.registry, webSearchTool)
      registerTool(ctx.registry, webFetchTool)
      registerTool(ctx.registry, getCurrentTimeTool)
      registerTool(ctx.registry, taskSubagentTool)
    }

    // Rebuild system prompt and reset
    const memories = loadMemories(ctx.workspaceRoot)
    ctx.systemPrompt = buildSystemPrompt(ctx.workspaceRoot, memories, ctx.mode)
    ctx.runtime.reset(ctx.systemPrompt)
    ctx.messages = ctx.runtime.getMessages()
    ctx.sessionApprovedTools.clear()
    ctx.sessionTotalInputTokens = 0
    ctx.sessionTotalOutputTokens = 0

    console.log(chalk.green(`Switched to ${modeArg} mode.`))
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/task ',
  description: 'Execute a complex task using Plan → Execute → Reflect → Revise',
  execute: async (input, ctx) => {
    const taskDesc = input.slice('/task '.length).trim()
    if (!taskDesc) {
      console.log(chalk.yellow('Usage: /task <description of the complex task>'))
      printUserMessageStart()
      ctx.rl.prompt()
      return
    }

    const wrappedInput = buildTaskPrompt(taskDesc)
    printUserMessageEnd()
    await executeAgentTurn(wrappedInput, ctx)
  },
})

registerCommand({
  name: '/compact',
  description: 'Compress conversation context to save tokens',
  execute: async (_input, ctx) => {
    await ctx.runtime.compactNow()
    ctx.rl.prompt()
  },
})
