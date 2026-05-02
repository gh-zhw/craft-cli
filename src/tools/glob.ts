// src/tools/glob.ts
import { z } from 'zod'
import fg from 'fast-glob'
import { validatePath } from '../utils/guard.js'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  pattern: z.string().describe('Glob pattern, e.g. "src/**/*.ts"'),
  path: z.string().optional().describe('Relative subdirectory to search in, defaults to workspace root'),
})

export const globTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'glob',
  description: 'Find files matching a glob pattern within the workspace.',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const baseDir = args.path ? validatePath(args.path, ctx.workspaceRoot) : ctx.workspaceRoot
    const files = await fg(args.pattern, {
      cwd: baseDir,
      absolute: false,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    })


    const MAX_FILES = 200
    let message = ''
    if (files.length > MAX_FILES) {
      message = `Found ${files.length} files, showing first ${MAX_FILES}:\n`
      files.splice(MAX_FILES)
    }
    return message + (files.length > 0 ? files.join('\n') : 'No files matched.')
  }
}
