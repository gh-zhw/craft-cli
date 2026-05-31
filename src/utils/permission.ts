// src/utils/permission.ts
import { isDangerousCommand } from './guard.js'
import type { ToolCallConfig } from './config.js'


export type PermissionLevel = 'auto' | 'confirm' | 'warn'

// Safe command whitelist
const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^ls\b/,
  /^pwd\b/,
  /^echo\b/,
  /^date\b/,
  /^whoami\b/,
  /^which\b/,
  /^type\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^wc\b/,
  /^du\b/,
  /^df\b/,
  /^find\b/,
  /^env\b/,
  /^printenv\b/,
  /^node\s+(--version|-v)\b/,
  /^npm\s+(--version|-v)\b/,
  /^pnpm\s+(--version|-v)\b/,
  /^git\s+status\b/,
  /^git\s+diff\b/,
  /^git\s+log\b/,
  /^git\s+branch\b/,
  /^git\s+remote\s+-v\b/,
  /^npm\s+run\b/,
  /^npm\s+test\b/,
  /^pnpm\s+run\b/,
  /^yarn\s+run\b/,
  /^tsc\s+--noEmit\b/,
  /^npx\s+tsc\s+--noEmit\b/,
]

function isSafeCommand(command: string): boolean {
  return SAFE_COMMAND_PATTERNS.some((p) => p.test(command.trim()))
}

/**
 * Determine the permission level for a tool call.
 * @param config Optional – if provided and autoApproveSafeCommands is false,
 *               safe commands will NOT be auto‑approved.
 */
export function getPermissionLevel(
  toolName: string,
  args: Record<string, any>,
  config?: ToolCallConfig,
): PermissionLevel {
  switch (toolName) {
    case 'read_file':
    case 'grep':
    case 'glob':
    case 'web_search':
    case 'get_current_time':
      return 'auto'

    case 'write_file':
    case 'edit_file':
    case 'add_memory':
    case 'web_fetch':
    case 'task_subagent':
      return 'confirm'

    case 'run_shell': {
      const command = args.command as string
      if (isDangerousCommand(command)) {
        return 'warn'
      }

      // Safe commands are auto if autoApproveSafeCommands is not explicitly disabled
      if (isSafeCommand(command)) {
        if (config?.autoApproveSafeCommands === false) {
          return 'confirm'
        }
        return 'auto'
      }

      return 'confirm'
    }
      
    default:
      // unknown tools – require confirmation for safety
      return 'confirm'
  }
}

/**
 * Generate a human‑readable prompt for approval dialogs.
 */
export function getApprovalMessage(
  toolName: string,
  args: Record<string, any>,
  level: PermissionLevel,
): string {
  const argsStr = JSON.stringify(args)
  let argsPreview = argsStr
  if (argsStr.length > 50) {
    argsPreview = argsStr.slice(0, 50) + '...'
  }
  switch (level) {
    case 'warn':
      return `DANGEROUS: ${toolName} with ${argsPreview}`
    case 'confirm':
      return `Allow tool '${toolName}' with ${argsPreview}?`
    default:
      return ''
  }
}

