// src/utils/config.ts
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface UserConfig {
  defaultModel?: string;
  autoApprove?: boolean;
  autoApproveSafeCommands?: boolean;
}

const DEFAULT_CONFIG: UserConfig = {
  autoApprove: false,
  autoApproveSafeCommands: true,
}

/**
 * Load user config from <workspaceRoot>/.craft/config.json (if exists)
 */
export function loadConfig(workspaceRoot: string): UserConfig {
  const configPath = join(workspaceRoot, '.craft', 'config.json')
  if (existsSync(configPath)) {
    try {
      const user = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...user }
    } catch {
      // Ignore malformed JSON
    }
  }
  return { ...DEFAULT_CONFIG }
}

/**
 * Ensure the .craft directory exists in the workspace root.
 */
export function ensureConfigDir(workspaceRoot: string): void {
  const dir = join(workspaceRoot, '.craft')
  mkdirSync(dir, { recursive: true })
}

/**
 * Build a system prompt with memories
 */
export function buildSystemPrompt(workspaceRoot: string, memories?: string): string {
  const agentMdPath = join(workspaceRoot, 'AGENT.md')
  let basePrompt = ''
  if (existsSync(agentMdPath)) {
    basePrompt = readFileSync(agentMdPath, 'utf-8').trim()
  } else {
    basePrompt = `You are **Craft Agent**, a precise terminal assistant. You have access to tools for reading, writing, editing files, running shell commands, searching with grep, and finding files with glob.
- Always use relative paths from the workspace root.
- When editing files, ensure the old_string is unique.
- Prefer safe commands, never execute dangerous ones.
- Be concise and helpful.`
  }

  // Prepend memories if present
  if (memories && memories.trim().length > 0) {
    return `## Memories (from previous sessions)\n${memories}\n\n## Agent Role\n${basePrompt}`
  }

  return basePrompt
}
