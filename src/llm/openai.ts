// src/llm/openai.ts
import OpenAI from 'openai'
import type Anthropic from '@anthropic-ai/sdk'
import type { Message, ToolCall, LLMResponse } from '../types.js'
import type { BaseProvider, ChatCallbacks } from './base.js'
import type { ThinkingConfig } from '../utils/config.js'

export class OpenAIProvider implements BaseProvider {
  private client: OpenAI
  private model: string
  private baseUrl: string
  private thinkingConfig?: Record<string, unknown>

  constructor(options: {
    model?: string;
    baseURL?: string;
    thinking?: ThinkingConfig;
  } = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required.')
    }

    this.model = options.model ?? 'gpt-4o'
    this.baseUrl = options.baseURL ?? 'https://api.openai.com/v1'

    this.client = new OpenAI({
      baseURL: this.baseUrl,
      apiKey,
    })
    
    if (options.thinking?.enabled) {
      const strength = options.thinking?.strength
      const effort = typeof strength === 'number' ? 'medium' : strength
      this.thinkingConfig = { type: 'enabled', reasoning_effort: effort }
    } else {
      this.thinkingConfig = { type: 'disabled' }
    }
  }

  async chat(
    messages: Message[],
    tools: Anthropic.Tool[],
    callbacks?: ChatCallbacks,
  ): Promise<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === 'system')
    const openaiMessages = this.convertMessages(
      messages.filter((m) => m.role !== 'system'),
    )
    const openaiTools =
      tools.length > 0 ? convertToolsToOpenAI(tools) : undefined

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        ...(systemMessage
          ? [{ role: 'system' as const, content: systemMessage.content }]
          : []),
        ...openaiMessages,
      ],
      tools: openaiTools,
      stream: true as const,
      ...(this.thinkingConfig
        ? ({ thinking: this.thinkingConfig })
        : {}),
    })

    let fullText = ''
    const toolCallMap = new Map<
      number,
      { id: string; name: string; arguments: string }
    >()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      // Stream text content
      if (delta?.content) {
        const text = delta.content
        fullText += text
        callbacks?.onText?.(text)
      }

      // Accumulate tool call fragments
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index
          if (!toolCallMap.has(index)) {
            toolCallMap.set(index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: '',
            })
          }
          const entry = toolCallMap.get(index)!
          if (tc.id) entry.id = tc.id
          if (tc.function?.name) entry.name = tc.function.name
          if (tc.function?.arguments)
            entry.arguments += tc.function.arguments
        }
      }
    }

    // Build final tool calls
    const toolCalls: ToolCall[] = []
    for (const [, entry] of toolCallMap) {
      try {
        toolCalls.push({
          id: entry.id,
          name: entry.name,
          arguments: JSON.parse(entry.arguments),
        })
      } catch {
        // ignore malformed arguments
      }
    }

    const stopReason: LLMResponse['stopReason'] =
      toolCalls.length > 0 ? 'tool_use' : 'end_turn'

    // OpenAI streaming doesn't return usage by default
    return {
      text: fullText,
      toolCalls,
      stopReason,
      usage: { input: 0, output: 0 },
      contentBlocks: [],
    }
  }

  private convertMessages(
    messages: Message[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        }
      }
      if (msg.role === 'tool' && msg.tool_call_id) {
        return {
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.content,
        }
      }
      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }
    })
  }

  getModelMaxTokens(): number {
    const map: Record<string, number> = {
      'gpt-4o': 128_000,
      'gpt-4-turbo': 128_000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385,
    }
    return map[this.model] ?? 128_000
  }

  getModelName(): string {
    return this.model
  }

  getProviderName(): string {
    return 'OpenAI'
  }

  getBaseUrl(): string {
    return this.baseUrl
  }
}

function convertToolsToOpenAI(
  anthropicTools: Anthropic.Tool[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return anthropicTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    },
  }))
}