// src/execute-turn.ts
import {
  printAssistantReplyStart,
  printAssistantReplyEnd,
  printStatus,
  printUserMessageStart,
} from './ui/chalk-ui.js'
import type { SessionContext } from './types.js'

/**
 * Core execution logic shared by normal messages and /task command.
 * Runs the user input through AgentRuntime, updates session state,
 * and renders the response.
 */
export async function executeAgentTurn(
  input: string,
  ctx: SessionContext
): Promise<void> {
  ctx.isProcessing = true
  try {
    printAssistantReplyStart()

    const result = await ctx.runtime.run(input)

    // Sync messages and token counters
    ctx.sessionTotalInputTokens += result.totalUsage.input
    ctx.sessionTotalOutputTokens += result.totalUsage.output

    printStatus(
      ctx.runtime.getContextTokens(),
      ctx.runtime.getProvider().getModelMaxTokens(),
      ctx.runtime.getLastTurnUsage(),
      ctx.runtime.getProvider().getModelName(),
      ctx.mode,
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
}
