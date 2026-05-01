// src/types.ts
import { z } from 'zod'

// ---------- Tool Protocol ----------

/**
 * Context passed to every tool execution
 */
export interface ToolContext {
  workspaceRoot: string;
  askApproval: (message: string) => Promise<boolean>;
}

/**
 * Generic tool definition
 * @template T - The inferred input type from the Zod type
 */
export interface Tool<T = any> {
  name: string;
  description: string;
  parameters: z.ZodType<T>;
  execute: (args: T, ctx: ToolContext) => Promise<string>;
}

// ---------- Unified Message Format ----------
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  toolCalls?: ToolCall[];
}

// ---------- Tool Call Block ----------
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}


// ---------- LLM Response ----------
export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input: number; output: number };
}
