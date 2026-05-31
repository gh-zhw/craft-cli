// src/utils/config.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'

export interface ThinkingConfig {
  enabled: boolean;
  /** 
   * Anthropic: budget_tokens (e.g. 4000)
   * OpenAI: reasoning_effort ('low' | 'medium' | 'high')
   */
  strength?: 'low' | 'medium' | 'high' | number;
}

export interface ContextCompressionConfig {
  enabled: boolean;
  lightTrimThreshold: number;
  deepCompactThreshold: number;
  keepRecentTurns: number;
  summaryMaxTokens: number;
}

export interface subagentConfig {
  maxParallel: number;
  maxTimeSeconds: number;
  maxToolCalls: number;
  verbose: boolean;
}

export interface ToolCallConfig {
  autoApprove: boolean;
  autoApproveSafeCommands: boolean;
  maxConsecutiveDenials: number;
  maxToolCallsPerTurn: number;
}

export interface UserConfig {
  provider: 'anthropic' | 'openai';
  baseUrl: string;
  model: string;
  maxTokens: number;
  thinking: ThinkingConfig;
  outputStyle: 'stream' | 'markdown';
  toolCall: ToolCallConfig;
  contextCompression: ContextCompressionConfig;
  subagents: subagentConfig;
}

const DEFAULT_CONFIG: UserConfig = {
  provider: 'anthropic',
  baseUrl: 'https://api.deepseek.com/anthropic',
  model: 'deepseek-v4-flash',
  maxTokens: 10_000,
  thinking: { enabled: false },
  outputStyle: 'stream',
  toolCall: {
    autoApprove: false,
    autoApproveSafeCommands: true,
    maxConsecutiveDenials: 3,
    maxToolCallsPerTurn: 50,
  },
  contextCompression: {
    enabled: true,
    lightTrimThreshold: 0.80,
    deepCompactThreshold: 0.90,
    keepRecentTurns: 5,
    summaryMaxTokens: 2_000,
  },
  subagents: {
    maxParallel: 5,
    maxTimeSeconds: 120,
    maxToolCalls: 30,
    verbose: false,
  }
}

export const CRAFT_DIR = '.craft'

/**
 * Ensure the .craft directory exists in the workspace root.
 */
export function ensureConfigDir(workspaceRoot: string): void {
  const dir = join(workspaceRoot, CRAFT_DIR)
  mkdirSync(dir, { recursive: true })
}

/**
 * Load user config from <workspaceRoot>/.craft/config.json.
 * If does not exist, create and write the default configuration.
 */
export function loadConfig(workspaceRoot: string): UserConfig {
  const configPath = join(workspaceRoot, CRAFT_DIR, 'config.json')
  if (existsSync(configPath)) {
    try {
      const user = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...user }
    } catch {
    }
  }
  writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
  return { ...DEFAULT_CONFIG }
}

/**
 * Load environment variables from <workspaceRoot>/.craft/.env.
 */
export function loadEnv(workspaceRoot: string) {
  ensureConfigDir(workspaceRoot)
  const envPath = join(workspaceRoot, CRAFT_DIR, '.env')
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true })
  } else {
    throw new Error(`Environment file not found: ${envPath}`)
  }
}
