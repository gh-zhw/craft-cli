// src/llm/provider.ts
import Anthropic from '@anthropic-ai/sdk';
import type { Message, ToolCall, LLMResponse } from '../types.js'
import { z } from 'zod'

export interface LLMProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export class LLMProvider {
  private client: Anthropic
  private model: string

  constructor(options: LLMProviderOptions = {}) {
    const baseUrl = options.baseUrl ?? process.env.ANTHROPIC_BASE_URL;
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required. Set it via environment variable or pass it in options.')
    }

    this.client = new Anthropic({
      baseURL: baseUrl,
      apiKey: apiKey
    })
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'deepseek-v4-flash';
  }

  /**
   * Send a conversation to the model and return either a final text response
   * or a list of tool calls.
   * 
   * @param messages - Array of conversation messages in our unified format
   * @param tools - Array of tool definitions in Anthropic format (name, description, input_schema)
   */
  async chat(
    messages: Message[],
    tools: Anthropic.Tool[],
  ): Promise<LLMResponse> {
    // Separate system message (Anthropic expects it as a top-level parameter)
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        // Tool Result Message: The tool_result content block must be used
        if (m.role === 'tool' && m.tool_call_id) {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: m.tool_call_id,
                content: m.content,
              },
            ],
          }
        }
        
        // Assistant message: If it includes tool calls, splice the text tool_use block
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          const blocks: Anthropic.ContentBlock[] = []
          if (m.content) {
            blocks.push({
              type: 'text',
              text: m.content,
            } as Anthropic.Messages.TextBlock)
          }
          for (const tc of m.toolCalls) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            } as Anthropic.Messages.ToolUseBlock)
          }
          return { role: 'assistant', content: blocks }
        }

        // Regular text message
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }
      })

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: chatMessages,
      tools: tools.length > 0 ? tools : undefined,
      thinking: { type: "disabled" },
    })

    // Wait for the complete messsage (event stream consumed internally)
    const finalMessage = await stream.finalMessage()

    // Parse text and tool calls from the content blocks
    let text = ''
    const toolCalls: ToolCall[] = []

    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, any>,
        })
      }
    }

    // Map Anthropic stop reason to our union
    const stopReasonMap: Record<string, LLMResponse['stopReason']> = {
      end_turn: 'end_turn',
      tool_use: 'tool_use',
      max_tokens: 'max_tokens',
      stop_sequence: 'stop_sequence',
    }

    return {
      text,
      toolCalls,
      stopReason: stopReasonMap[finalMessage.stop_reason ?? 'end_turn'],
      usage: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
    }
  }
}
