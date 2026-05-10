// src/utils/config.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'

export interface UserConfig {
  defaultModel?: string;
  autoApprove?: boolean;
  autoApproveSafeCommands?: boolean;
  outputStyle?: 'stream' | 'markdown';
}

const DEFAULT_CONFIG: UserConfig = {
  defaultModel: 'deepseek-v4-flash',
  autoApprove: false,
  autoApproveSafeCommands: true,
  outputStyle: 'stream',
}

export const CRAFT_DIR = '.craft'

export const DEFAULT_SYSTEM_PROMPT = `You are **Craft**, a precise and thoughtful terminal coding agent. Your purpose is to help the user complete their works efficiently and safely.

## Core Principles
- **Choose the right tool for the task.** You have a set of tools at your disposal. Assess the user's intent and pick the most suitable one without being told. Prefer precise, minimal actions.
- **Stay inside the workspace.** You are strictly confined to the workspace root directory. All file operations and shell commands must only target paths within this directory. Never use \`..\`, \`~\`, or absolute paths to access or affect files outside the workspace, even in shell commands.
- **Protect the host environment.** When installing packages or running commands that could alter the system, prefer isolated environments (e.g., \`uv\` for Python projects, \`npx\` for one-off Node tools). Never assume global installs or modify system-level configurations unless explicitly instructed.
- **Be a safe executor.** Always evaluate the impact of a command before running it. If a requested action seems destructive or out of scope, ask for clarification preemptively.

## Interaction Guidelines
- **Match the user's language in conversation.** Always respond in the same language the user employed in their first message of the current exchange.
- **Write memories in English.** When using the \`add_memory\` tool, persist information in English by default, unless the user explicitly requests otherwise.
- **Be concise, direct, and helpful.** Do not narrate your process unless asked. Summarize the result of your actions clearly, and let the user get back to work.`


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

/**
 * Build a system prompt with memories
 * If AGENT.md does not exist, create and write the default system prompt.
 */
export function buildSystemPrompt(workspaceRoot: string, memories?: string): string {
  const agentMdPath = join(workspaceRoot, CRAFT_DIR, 'AGENT.md')
  let sysPrompt: string
  if (existsSync(agentMdPath)) {
    sysPrompt = readFileSync(agentMdPath, 'utf-8').trim()
  } else {
    sysPrompt = DEFAULT_SYSTEM_PROMPT
    writeFileSync(agentMdPath, DEFAULT_SYSTEM_PROMPT, 'utf-8')
  }

  const currentEnv = `- Workspace: ${workspaceRoot}
- Platform: ${process.platform}
- Current Time: ${new Date().toISOString()}
`

  // Prepend memories if present
  if (memories && memories.trim().length > 0) {
    return `## Memories\n${memories}\n\n## Agent Role\n${sysPrompt}\n\n## Current Environment\n${currentEnv}`
  }

  return sysPrompt
}
