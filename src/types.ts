// src/types.ts
import { z } from 'zod'
import type { UserConfig } from './utils/config.js'
import type { PermissionLevel } from './utils/permission.js'
import { LLMProvider } from './llm/provider.js'
import { ToolRegistry } from './tools/registry.js'
import { AgentRuntime } from './agent-runtime.js'


// ---------- Approval Types ----------
export type ApprovalAction = 'approve' | 'deny' | 'always' | 'stop'

export interface ApprovalRequest {
  toolName: string;
  args: Record<string, any>;
  message: string;      // Prompt text corresponding to the level
  level: PermissionLevel;
  agentName?: string;
}

// ---------- Tool Protocol ----------
/**
 * Context passed to every tool execution
 */
export interface ToolContext {
  workspaceRoot: string;
  askApproval: (request: ApprovalRequest) => Promise<ApprovalAction>;
  config: UserConfig;
  agentRuntime?: AgentRuntime;  // For taskSubagentTool
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
  provider: string;
  baseurl: string;
  model: string;
  inputTokensUsed: number;
  outputTokensUsed: number;
  currentContext: number;
  contextLimit: number;
  workspace: string;
  toolsCount: number;
  autoApprove: boolean;
  messagesCount: number;
  mode: 'chat' | 'agent';
}

/**
 * Session‑wide state that REPL commands can read or mutate.
 * All mutable fields are updated in place.
 */
export interface SessionContext {
  /** The current conversation messages (synced from runtime) */
  messages: Message[];
  /** Base system prompt (used when resetting) */
  systemPrompt: string;
  /** Session token counter */
  sessionTotalInputTokens: number;
  sessionTotalOutputTokens: number;
  /** The tool context (including config) – its config.autoApprove may be changed */
  toolContext: ToolContext;
  /** Original user config (for restoring autoApprove) */
  userConfig: { autoApprove?: boolean };
  /** Session tool whitelist (auto approve) */
  sessionApprovedTools: Set<string>;
  /** The LLM provider (for info command) */
  provider: LLMProvider;
  /** The tool registry (for info command) */
  registry: ToolRegistry;
  /** Workspace root */
  workspaceRoot: string;
  /** readline interface (for prompt after command) */
  rl: import('node:readline').Interface;
  /** Marker that the REPL is processing a command (prevents duplicate prompts) */
  isProcessing: boolean;
  /** The persistent AgentRuntime instance for this session */
  runtime: AgentRuntime;
  /** Launch mode — chat (no tools) or agent (full tool set) */
  mode: 'chat' | 'agent';
}

// ---------- Agent Runtime ----------
export interface RuntimeConfig extends UserConfig {
}

export interface AgentRuntimeOptions {
  provider: any;                        // LLMProvider
  registry: any;                        // ToolRegistry
  toolContext: ToolContext;
  systemPrompt: string;
  config: RuntimeConfig;
  sessionApprovedTools?: Set<string>;   // Shared whitelist
  initialMessages?: Message[];          // Existing historical messages (excluding system messages)
  agentName?: string;
  isSubAgent?: boolean;
}

export interface AgentRunResult {
  finalText: string;
  updatedMessages: Message[];
  totalUsage: { input: number; output: number };
  terminationReason?: 'end_turn' | 'max_tokens' | 'consecutive_denials' | 'max_tool_calls' | 'user_stop';
}

export interface AgentEvents {
  text: (chunk: string) => void;
  toolStart: (name: string, args: Record<string, any>) => void;
  toolEnd: (name: string, result: string, error?: boolean) => void;
  approvalRequired: (request: ApprovalRequest) => Promise<ApprovalAction>;
  terminated: (reason: string | undefined) => void;
  streamFinished: () => void;
  contextCompacted: (details: { contextTokens: number; limit: number }) => void;
}
