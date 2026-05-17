// src/repl-commands.ts
import type { SessionContext } from './types.js'
import { addMemory, hasMemories } from './utils/memory.js'
import { printAssistantReplyEnd, printAssistantReplyStart, printSessionInfo } from './ui/chalk-ui.js'
import { printAssistantHeader, printUserMessageStart } from './ui/chalk-ui.js'
import { AgentRuntime } from './agent-runtime.js'
import { buildTaskPrompt } from './utils/prompts.js'
import { printStatus } from './ui/chalk-ui.js'
import chalk from 'chalk'


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
    ctx.sessionTotalTokens = 0
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
  description: 'Enable auto‑approve mode for this session',
  execute: (_input, ctx) => {
    ctx.toolContext.config.autoApprove = true
    console.log(chalk.green('✓ Auto-approve mode ON'))
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/ask',
  description: 'Restore interactive approval mode',
  execute: (_input, ctx) => {
    ctx.toolContext.config.autoApprove = ctx.userConfig.autoApprove ?? false
    console.log(chalk.yellow('✓ Interactive approval mode restored'))
    ctx.rl.prompt()
  },
})

registerCommand({
  name: '/info',
  description: 'Display session information',
  execute: (_input, ctx) => {
    const providerModel = ctx.provider.getModelName()
    const maxTokens = ctx.provider.getModelMaxTokens()
    const memAvail = hasMemories(ctx.workspaceRoot)
    printSessionInfo({
      model: providerModel,
      tokensUsed: ctx.sessionTotalTokens,
      contextLimit: maxTokens,
      workspace: ctx.workspaceRoot,
      toolsCount: ctx.registry.size,
      hasMemories: memAvail,
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

    const wrapped = buildTaskPrompt(taskDesc)

    // Prevent user input during execution
    ctx.isProcessing = true
    try {
      printAssistantReplyStart()
      const result = await ctx.runtime.run(wrapped)

      // Sync messages back to the context
      ctx.messages = ctx.runtime.getMessages()
      const turnTokens = result.totalUsage.input + result.totalUsage.output
      ctx.sessionTotalTokens += turnTokens

      if (result.terminationReason === 'consecutive_denials') {
        console.log(chalk.yellow('Task stopped because you denied tool calls.'))
      } else if (result.terminationReason === 'max_tool_calls') {
        console.log(chalk.yellow('Task stopped because it reached the tool call limit.'))
      }

      printStatus(
        ctx.runtime.getContextTokens(),
        ctx.provider.getModelMaxTokens(),
        ctx.runtime.getLastApiUsage(),
        ctx.provider.getModelName()
      )
      printAssistantReplyEnd()
    } catch (error: any) {
      console.error('System Error:', error.message)
      printAssistantReplyEnd()
    } finally {
      ctx.isProcessing = false
      printUserMessageStart()
      ctx.rl.prompt()
    }
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
