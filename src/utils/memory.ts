// src/utils/memory.ts
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function memoryFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.craft', 'memories.md');
}

/**
 * Read the memory file and return its content (up to last 200 lines).
 */
export function loadMemories(workspaceRoot: string): string {
  const file = memoryFilePath(workspaceRoot)
  if (!existsSync(file)) {
    return ''
  }
  const content = readFileSync(file, 'utf-8')
  const lines = content.split('\n')
  // keep only the most recent 200 lines
  if (lines.length > 200) {
    return lines.slice(lines.length - 200).join('\n')
  }
  return content
}

/**
 * Append a new memory line with the current date.
 */
export function addMemory(workspaceRoot: string, content: string): void {
  const file = memoryFilePath(workspaceRoot)
  // Ensure directory exists
  mkdirSync(join(workspaceRoot, '.craft'), { recursive: true })
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const line = `- [${today}] ${content.trimEnd()}\n`
  appendFileSync(file, line, 'utf-8')
}
