// src/utils/guard.ts
import path from 'node:path'

/**
 * Validate that the given file path is within the workspace root
 * Resolves relative paths and rejects traversal attempts
 * @returns absolute safe path
 */
export function validatePath(filePath: string, workspaceRoot: string): string {
  // Resolve to absolute path to normalize any ../ or ./
  const resolved = path.resolve(workspaceRoot, filePath)
  const rootPlusSep = workspaceRoot.endsWith(path.sep)
    ? workspaceRoot
    : workspaceRoot + path.sep
  if (!resolved.startsWith(rootPlusSep) && resolved !== workspaceRoot) {
    throw new Error(`Access denied: path '${filePath} is outside the workspace.'`)
  }
  return resolved
}

/**
 * Check if the command string contains dangerous patterns
 * Returns true if the command should be blocked
 */
export function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /rm\s+(-[^\s]*r[^\s]*f\s+|--recursive\s+--force\s+|--force\s+--recursive\s+)\//, // rm -rf /
    /\bsudo\b/,
    /\bchmod\s+777\b/,
    /\bcurl\b.*\|\s*(sh|bash|zsh)/,
    /\bwget\b.*-O-\s*\|\s*(sh|bash|zsh)/,
    />\s*\/dev\/sda/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /\b:(){ :|:& };:/, // fork bomb
  ]
  return dangerousPatterns.some((pattern) => pattern.test(command))
}

/**
 * Placeholder for future command sanitization
 * Currently returns the command unchanged.
 */
export function sanitizeCommand(command: string): string {
  return command
}
