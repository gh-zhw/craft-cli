// src/agent-loop.ts
import type { Message, ToolContext, LLMResponse } from './types.js'
import type { ChatCallbacks, LLMProvider } from './llm/provider.js'
import type { ToolRegistry } from './tools/registry.js'
import { getToolSchemas } from './tools/registry.js'
import {
  printStreamingText,
  finishStream,
  printToolCallStart,
  printToolCallEnd,
} from './ui/chalk-ui.js'
import chalk from 'chalk'


export interface AgentLoopResult {
  finalText: string;
  updatedMessages: Message[];
  totalUsage: { input: number; output: number };
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
  let totalInput = 0;
  let totalOutput = 0;

  while (true) {
    let streamingStarted = false

    const callbacks: ChatCallbacks = {
      onText: (chunk) => {
        if (!streamingStarted) {
          streamingStarted = true;
        }
        printStreamingText(chunk);
      },
    }

    const response: LLMResponse = await provider.chat(messages, toolSchemas, callbacks)

    if (streamingStarted) {
      finishStream();
    }

    // Accumulate tokens across all calls in this agent loop
    totalInput += response.usage.input;
    totalOutput += response.usage.output;

    if (response.stopReason === 'tool_use') {
      // Add the assistant message that contains the tool calls
      messages.push({
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls,
        contentBlocks: response.contentBlocks,
      })

      // Execute each tool and feed the results back
      for (const tc of response.toolCalls) {
        const tool = registry.get(tc.name)
        if (!tool) {
          throw new Error(`Unknown tool requested: ${tc.name}`)
        }

        printToolCallStart(tc.name, tc.arguments)
        try {
          const result = await tool.execute(tc.arguments, context);
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

      continue;
    }

    // All stop reasons that signal the end of the conversation:
    // end_turn, max_tokens, stop_sequence
    if (response.stopReason === 'max_tokens') {
      console.log(chalk.yellow('⚠️  Response truncated (max tokens reached)'));
    }

    if (!streamingStarted) {
      finishStream();
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
