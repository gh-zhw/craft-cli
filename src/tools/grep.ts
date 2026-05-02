// src/tools/grep.ts
import { z } from 'zod'
import fg from 'fast-glob'
import { readFileSync } from 'node:fs'
import { validatePath } from '../utils/guard.js'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  path: z.string().optional().describe('Subdirectory to search (relative to workspace root), defaults to root'),
  include: z.string().optional().describe('Glob pattern to filter files. To search in all subdirectories, prefix with "**/", e.g. "**/*.ts". A bare "*.ts" only matches files in the current directory.')
})

const MAX_RESULT_LEN = 8_000

export const grepTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'grep',
  description: 'Search for a regex pattern in workspace files, optionally filtered by a glob pattern.',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const searchDir = args.path ? validatePath(args.path, ctx.workspaceRoot) : ctx.workspaceRoot
    const includePattern = args.include ?? '**/*'
    const regex = new RegExp(args.pattern)

    const files = await fg(includePattern, {
      cwd: searchDir,
      absolute: true,
      // Ignore common directories
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**']
    })

    const results: string[] = []
    let totalLength = 0

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const relativePath = file.replace(ctx.workspaceRoot + '/', '')
            const line = `${relativePath}:${i + 1}: ${lines[i].trimEnd()}`
            if (totalLength + line.length + 1 > MAX_RESULT_LEN) {
              results.push('... (results truncated)')
              return results.join('\n')
            }
            results.push(line)
            totalLength += line.length + 1
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return results.length > 0 ? results.join('\n') : 'No matches found.'
  }
}
