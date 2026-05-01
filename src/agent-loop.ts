// src/agent-loop.ts
import type { Message, ToolContext, LLMResponse } from './types.js';
import type { LLMProvider } from './llm/provider.js';
import type { ToolRegistry } from './tools/registry.js';
import { getToolSchemas } from './tools/registry.js';

export async function agentLoop(
  provider: LLMProvider,
  registry: ToolRegistry,
  systemPrompt: string,
  userMessage: string,
  context: ToolContext,
): Promise<string> {
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  // Convert tools to Anthropic format once (they are immutable per loop)
  const toolSchemas = getToolSchemas(registry)

  while (true) {
    const response: LLMResponse = await provider.chat(messages, toolSchemas)

    if (response.stopReason === 'end_turn') {
      // Model finished without requesting any tools
      return response.text
    }

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

        console.log(`[Agent Loop] Calling tool: ${tc.name} with`, tc.arguments)

        const result = await tool.execute(tc.arguments, context)
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      }

      continue;
    }

    messages.push({
      role: 'assistant',
      content: response.text,
      contentBlocks: response.contentBlocks,
    });

    return response.text
  }
}
