// src/llm/provider.ts
import Anthropic from '@anthropic-ai/sdk'
import type { Message, LLMResponse } from '../types.js'
import { AnthropicProvider } from './anthropic.js'
import { OpenAIProvider } from './openai.js'
import type { BaseProvider, ChatCallbacks } from './base.js'
import type { ThinkingConfig } from '../utils/config.js'
import { TokenCounter } from '../utils/token-counter.js'

export interface LLMProviderOptions {
  provider?: 'anthropic' | 'openai';
  model?: string;
  baseUrl?: string;
  thinking?: ThinkingConfig;
}

export { ChatCallbacks } from './base.js'

export class LLMProvider implements BaseProvider {
  private inner: BaseProvider

  constructor(options: LLMProviderOptions = {}) {
    const providerType = options.provider ?? 'anthropic'

    if (providerType === 'openai') {
      this.inner = new OpenAIProvider({
        model: options.model,
        baseURL: options.baseUrl,
        thinking: options.thinking,
      })
    } else {
      // Anthropic (default)
      this.inner = new AnthropicProvider({
        model: options.model,
        baseURL: options.baseUrl,
        thinking: options.thinking,
      })
    }
  }

  async chat(
    messages: Message[],
    tools: Anthropic.Tool[],
    callbacks?: ChatCallbacks,
  ): Promise<LLMResponse> {
    return this.inner.chat(messages, tools, callbacks)
  }

  createTokenCounter(): TokenCounter {
    return new TokenCounter(this.inner.getModelName())
  }

  getModelMaxTokens(): number {
    return this.inner.getModelMaxTokens()
  }

  getModelName(): string {
    return this.inner.getModelName()
  }

  getProviderName(): string {
    return this.inner.getProviderName()
  }

  getBaseUrl(): string {
    return this.inner.getBaseUrl()
  }
}