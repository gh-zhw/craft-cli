// src/types.ts
import { z } from 'zod'
import type { UserConfig } from './utils/config.js'
import type { PermissionLevel } from './utils/permission.js'


// ---------- Approval Types ----------
export type ApprovalAction = 'approve' | 'deny' | 'approve_all' | 'stop';

export interface ApprovalRequest {
  toolName: string;
  args: Record<string, any>;
  message: string;      // Prompt text corresponding to the level
  level: PermissionLevel;
}

// ---------- Tool Protocol ----------
/**
 * Context passed to every tool execution
 */
export interface ToolContext {
  workspaceRoot: string;
  askApproval: (request: ApprovalRequest) => Promise<ApprovalAction>;
  config: UserConfig;
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
  contentBlocks?: any[];  // Anthropic.ContentBlock[]
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
  contentBlocks: any[];  // Anthropic.ContentBlock[]
}

// ---------- Session Information ----------
export interface SessionInfoProps {
  model: string;
  tokensUsed: number;
  contextLimit: number;
  workspace: string;
  toolsCount: number;
  hasMemories: boolean;
  autoApprove: boolean;
  messagesCount: number;
}

