// src/repl-commands.ts
import type { SessionContext } from './types.js'
import { addMemory } from './utils/memory.js'
import { printSessionInfo, printUserMessageEnd } from './ui/chalk-ui.js'
import { printAssistantHeader, printUserMessageStart } from './ui/chalk-ui.js'
import { buildTaskPrompt } from './utils/prompts.js'
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

// ── Built‑in commands ─────────────────────────────────────────────

registerCommand({
  name: '/exit',
  description: 'Exit the REPL',
  execute: () => process.exit(0),
})

registerCommand({
  name: '/reset',
  description: 'Clear conversation and reset session',
  execute: (_input, ctx) => {
    ctx.runtime.reset(ctx.systemPrompt)
    ctx.messages = ctx.runtime.getMessages()
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
    })
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
