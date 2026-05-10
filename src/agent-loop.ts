// src/agent-loop.ts
import type { Message, ToolContext, LLMResponse } from './types.js'
import type { ChatCallbacks, LLMProvider } from './llm/provider.js'
import type { ToolRegistry } from './tools/registry.js'
import { getToolSchemas } from './tools/registry.js'
import chalk from 'chalk'
import {
  printStreamingText,
  finishStream,
  printToolCallStart,
  printToolCallEnd,
  printMarkdown,
} from './ui/chalk-ui.js'
import {
  getPermissionLevel,
  getApprovalMessage,
} from './utils/permission.js'


export interface AgentLoopResult {
  finalText: string;
  updatedMessages: Message[];
  totalUsage: { input: number; output: number };
  terminationReason?: 'consecutive_denials' | 'max_tool_calls' | null;
}

/**
 * Run the agent loop with an existing message history.
 * Returns the final assistant response and the extended message list.
 */
export async function agentLoop(
  provider: LLMProvider,
  registry: ToolRegistry,
  context: ToolContext,
  messages: Message[]
): Promise<AgentLoopResult> {
  // Convert tools to Anthropic format once (they are immutable per loop)
  const toolSchemas = getToolSchemas(registry)
  let totalInput = 0
  let totalOutput = 0
  const outputStyle = context.config.outputStyle ?? 'stream'
  const maxConsecutiveDenials = context.config.maxConsecutiveDenials ?? 3
  const maxToolCallsPerTurn = context.config.maxToolCallsPerTurn ?? 15

  let consecutiveDenials = 0
  let totalToolCalls = 0

  while (true) {
    let streamingStarted = false

    const callbacks: ChatCallbacks = {}
    if (outputStyle === 'stream') {
      callbacks.onText = (chunk) => {
        if (!streamingStarted) {
          streamingStarted = true
        }
        printStreamingText(chunk)
      }
    }

    const response: LLMResponse = await provider.chat(messages, toolSchemas, callbacks)

    if (streamingStarted) {
      finishStream()
    }

    // Accumulate tokens across all calls in this agent loop
    totalInput += response.usage.input
    totalOutput += response.usage.output

    if (response.stopReason === 'tool_use') {
      // Add the assistant message that contains the tool calls
      messages.push({
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls,
        contentBlocks: response.contentBlocks,
      })

      let shouldStop = false
      let terminationType: AgentLoopResult['terminationReason'] = null
      let terminationMessage = ''

      // Execute each tool and feed the results back
      for (const tc of response.toolCalls) {
        if (shouldStop) {
          messages.push({
            role: 'tool',
            content: 'Error: Task terminated before this tool could execute.',
            tool_call_id: tc.id,
          });
          continue;
        }

        const tool = registry.get(tc.name)
        if (!tool) {
          throw new Error(`Unknown tool requested: ${tc.name}`)
        }

        if (maxToolCallsPerTurn > 0 && totalToolCalls >= maxToolCallsPerTurn) {
          shouldStop = true
          terminationType = 'max_tool_calls'
          terminationMessage = 'Task terminated: maximum number of tool calls reached.'
          messages.push({
            role: 'tool',
            content: 'Error: Task terminated before this tool could execute.',
            tool_call_id: tc.id,
          })
          continue
        }
        totalToolCalls++

        const level = getPermissionLevel(tc.name, tc.arguments, context.config)
        const msg = getApprovalMessage(tc.name, tc.arguments, level)
        let approved = true

        if (level !== 'auto' && !context.config.autoApprove) {
          printToolCallStart(tc.name, tc.arguments)
          try {
            approved = await context.askApproval(msg, level)
          } catch {
            approved = false
          }
          if (!approved) {
            messages.push({
              role: 'tool' as const,
              content: 'Error: User denied the operation.',
              tool_call_id: tc.id,
            })
            consecutiveDenials++
            if (maxConsecutiveDenials > 0 && consecutiveDenials >= maxConsecutiveDenials) {
              shouldStop = true
              terminationType = 'consecutive_denials'
              terminationMessage = 'Task terminated: too many consecutive tool call denials.'
            }
            continue
          }
        }
        // Reset the continuous rejection counter
        consecutiveDenials = 0

        printToolCallStart(tc.name, tc.arguments)
        try {
          const result = await tool.execute(tc.arguments, context)
          printToolCallEnd(tc.name, tc.arguments)
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          })
        } catch (err: any) {
          printToolCallEnd(tc.name, err.message, true)
          messages.push({
            role: 'tool',
            content: `Error: ${err.message}`,
            tool_call_id: tc.id
          })
        }
      }

      if (shouldStop) {
        messages.push({
          role: 'assistant',
          content: `${terminationMessage}`,
        });
        return {
          finalText: terminationMessage,
          updatedMessages: messages,
          totalUsage: { input: totalInput, output: totalOutput },
          terminationReason: terminationType,
        };
      }

      continue
    }

    // All stop reasons that signal the end of the conversation:
    // end_turn, max_tokens, stop_sequence
    if (response.stopReason === 'max_tokens') {
      console.log(chalk.red('Response truncated (max tokens reached)'))
    }

    if (outputStyle === 'markdown') {
      printMarkdown(response.text);
    } else {
      if (!streamingStarted) {
        finishStream();
      }
    }

    // Append final assistant message to history
    messages.push({
      role: 'assistant',
      content: response.text,
      contentBlocks: response.contentBlocks,
    })

    return {
      finalText: response.text,
      updatedMessages: messages,
      totalUsage: { input: totalInput, output: totalOutput },
    }
  }
}
