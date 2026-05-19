// src/llm/anthropic.ts
import Anthropic from '@anthropic-ai/sdk'
import type { Message, ToolCall, LLMResponse } from '../types.js'
import type { BaseProvider, ChatCallbacks } from './base.js'
import type { ThinkingConfig } from '../utils/config.js'

export class AnthropicProvider implements BaseProvider {
  private client: Anthropic
  private model: string
  private baseUrl: string
  private thinkingConfig: Anthropic.ThinkingConfigParam

  constructor(options: {
    model?: string;
    baseURL?: string;
    thinking?: ThinkingConfig;
  } = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required.')
    }

    this.model = options.model ?? 'claude-haiku-4-5'
    this.baseUrl = options.baseURL ?? 'https://api.anthropic.com'

    this.client = new Anthropic({
      baseURL: this.baseUrl,
      apiKey,
    })

    if (options.thinking?.enabled) {
      const strength = options.thinking?.strength
      const budget = typeof strength === 'number' ? strength : 4000
      this.thinkingConfig = { type: 'enabled', budget_tokens: budget }
    } else {
      this.thinkingConfig = { type: 'disabled' }
    }
  }

  async chat(
    messages: Message[],
    tools: Anthropic.Tool[],
    max_tokens?: number,
    callbacks?: ChatCallbacks,
  ): Promise<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = this.convertMessages(messages)

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: max_tokens ?? 4096,
      system: systemMessage?.content,
      messages: chatMessages,
      tools: tools.length > 0 ? tools : undefined,
      thinking: this.thinkingConfig,
    })

    let fullText = ''
    const toolCalls: ToolCall[] = []

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const chunk = event.delta.text
        fullText += chunk
        callbacks?.onText?.(chunk)
      }
    }

    const finalMessage = await stream.finalMessage()
    const contentBlocks = finalMessage.content

    for (const block of contentBlocks) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, any>,
        })
      }
    }

    const stopReasonMap: Record<string, LLMResponse['stopReason']> = {
      end_turn: 'end_turn',
      tool_use: 'tool_use',
      max_tokens: 'max_tokens',
      stop_sequence: 'stop_sequence',
    }

    return {
      text: fullText,
      toolCalls,
      stopReason:
        stopReasonMap[finalMessage.stop_reason ?? 'end_turn'],
      usage: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
      contentBlocks,
    }
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    // 原 provider.ts 中的 convertMessages 完全不变，复制过来
    const result: Anthropic.MessageParam[] = []
    const msgs = messages.filter((m) => m.role !== 'system')
    let i = 0
    while (i < msgs.length) {
      const msg = msgs[i]
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        let assistantBlocks: Anthropic.ContentBlock[]
        if (msg.contentBlocks && msg.contentBlocks.length > 0) {
          assistantBlocks = msg.contentBlocks
        } else {
          assistantBlocks = []
          if (msg.content) {
            assistantBlocks.push({
              type: 'text',
              text: msg.content,
            } as Anthropic.Messages.ContentBlock)
          }
          for (const tc of msg.toolCalls) {
            assistantBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            } as Anthropic.Messages.ContentBlock)
          }
        }
        result.push({ role: 'assistant', content: assistantBlocks })

        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = []
        i++
        while (i < msgs.length && msgs[i].role === 'tool') {
          const toolMsg = msgs[i]
          if (toolMsg.tool_call_id) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolMsg.tool_call_id,
              content: toolMsg.content,
            })
          }
          i++
        }
        if (toolResultBlocks.length > 0) {
          result.push({ role: 'user', content: toolResultBlocks })
        }
        continue
      }

      if (msg.role === 'tool') {
        if (msg.tool_call_id) {
          result.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: msg.content,
              },
            ],
          })
        }
        i++
        continue
      }

      result.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
      i++
    }
    return result
  }

  getModelMaxTokens(): number {
    const map: Record<string, number> = {
      'claude-sonnet-4-20250514': 200_000,
      'claude-3-5-sonnet-20241022': 200_000,
      'deepseek-v4-flash': 128_000,
      'deepseek-v4-pro': 128_000,
    }
    return map[this.model] ?? 128_000
  }

  getModelName(): string {
    return this.model
  }

  getProviderName(): string {
    return 'Anthropic'
  }

  getBaseUrl(): string {
    return this.baseUrl
  }
}