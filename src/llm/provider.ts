// src/llm/provider.ts
import Anthropic from '@anthropic-ai/sdk'
import type { Message, ToolCall, LLMResponse } from '../types.js'

export interface LLMProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /**
   * Anthropic extended thinking configuration
   * Default: { type: "disabled" }
   * Set to e.g., { type: "enabled", budget_tokens: 4000 } to activate
   */
  thinking?: Anthropic.ThinkingConfigParam;
}

export interface ChatCallbacks {
  onText?: (chunk: string) => void;  // stream text delta
}

export class LLMProvider {
  private client: Anthropic
  private model: string
  private thinkingConfig: Anthropic.ThinkingConfigParam

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
    this.model = options.model ?? process.env.ANTHROPIC_MODEL!;
    this.thinkingConfig = options.thinking ?? { type: 'disabled' };
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
    callbacks?: ChatCallbacks,
  ): Promise<LLMResponse> {
    // Separate system message (Anthropic expects it as a top-level parameter)
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = this.convertMessages(messages)

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: chatMessages,
      tools: tools.length > 0 ? tools : undefined,
      thinking: this.thinkingConfig,
    })

    // Accumulate full text and stream text delta to callbacks
    let fullText = ''
    const toolCalls: ToolCall[] = []

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const chunk = event.delta.text
        fullText += chunk
        if (callbacks?.onText) {
          callbacks.onText(chunk)
        }
      }
    }

    const finalMessage = await stream.finalMessage()

    // Extract tool calls from final content blocks
    const contentBlocks = finalMessage.content;
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
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
      text: fullText,
      toolCalls,
      stopReason: stopReasonMap[finalMessage.stop_reason ?? 'end_turn'],
      usage: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
      contentBlocks,
    }
  }

  /**
  * Convert our internal Message[] to Anthropic SDK MessageParam[].
  * Handles tool results, assistant messages with contentBlocks, and plain text.
  */
  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];
    const msgs = messages.filter((m) => m.role !== 'system');
    let i = 0;

    while (i < msgs.length) {
      const msg = msgs[i];

      // Assistant message that contains tool calls
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Build assistant content blocks
        let assistantBlocks: Anthropic.ContentBlock[];
        if (msg.contentBlocks && msg.contentBlocks.length > 0) {
          assistantBlocks = msg.contentBlocks;
        } else {
          assistantBlocks = [];
          if (msg.content) {
            assistantBlocks.push({
              type: 'text',
              text: msg.content
            } as Anthropic.Messages.ContentBlock);
          }
          for (const tc of msg.toolCalls) {
            assistantBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            } as Anthropic.Messages.ContentBlock);
          }
        }
        result.push({ role: 'assistant', content: assistantBlocks });

        // Collect consecutive tool result messages that follow this assistant
        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
        i++;
        while (i < msgs.length && msgs[i].role === 'tool') {
          const toolMsg = msgs[i];
          if (toolMsg.tool_call_id) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolMsg.tool_call_id,
              content: toolMsg.content,
            });
          }
          i++;
        }

        // All tool results gathered – push a single user message containing them all
        if (toolResultBlocks.length > 0) {
          result.push({ role: 'user', content: toolResultBlocks });
        }
        continue;
      }

      // Standalone tool message (should not normally happen after proper merging)
      if (msg.role === 'tool') {
        if (msg.tool_call_id) {
          result.push({
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content },
            ],
          });
        }
        i++;
        continue;
      }

      // Plain user or assistant message (no tools)
      result.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
      i++;
    }

    return result;
  }

  /**
   * Approximate maximum context window size for the current model.
   */
  getModelMaxTokens(): number {
    const map: Record<string, number> = {
      'claude-sonnet-4-20250514': 200_000,
      'claude-3-5-sonnet-20241022': 200_000,
      'deepseek-v4-flash': 128_000,
      'deepseek-v4-pro': 128_000,
    }
    return map[this.model] ?? 128_000; // default
  }

  /**
   * Get current model name.
   */
  getModelName(): string {
    return this.model
  }
}
