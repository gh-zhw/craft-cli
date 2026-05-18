// src/llm/base.ts
import type { Message, LLMResponse } from '../types.js'
import type Anthropic from '@anthropic-ai/sdk';

export interface ChatCallbacks {
  onText?: (chunk: string) => void;
}

export interface BaseProvider {
  chat(
    messages: Message[],
    tools: Anthropic.Tool[],
    callbacks?: ChatCallbacks,
  ): Promise<LLMResponse>;

  getProviderName(): string;
  getBaseUrl(): string;
  getModelMaxTokens(): number;
  getModelName(): string;
}
