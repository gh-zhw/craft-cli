// src/utils/config.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface UserConfig {
  defaultModel?: string;
  autoApprove?: boolean;
}

/**
 * Load user config from ~/.craft-cli/config.json (if exists)
 */
export function loadConfig(): UserConfig {
  const configPath = join(process.env.HOME ?? process.env.USERPROFILE ?? '~', '.craft-cli', 'config.json')
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      // Ignore malformed JSON
    }
  }
  return {}
}

/**
 * Build a system prompt
 */
export function buildSystemPrompt(workspaceRoot: string): string {
  const agentMdPath = join(workspaceRoot, 'AGENT.md')
  if (existsSync(agentMdPath)) {
    return readFileSync(agentMdPath, 'utf-8').trim()
  }

  // Fallback: minimal role identity
  return `You are **Craft Agent**, a precise terminal assistant. You have access to tools for reading, writing, editing files, running shell commands, searching with grep, and finding files with glob.
- Always use relative paths from the workspace root.
- When editing files, ensure the old_string is unique.
- Prefer safe commands, never execute dangerous ones.
- Be concise and helpful.`
}
