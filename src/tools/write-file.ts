// src/tools/write-file.ts
import { z } from 'zod'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { validatePath } from '../utils/guard.js'
import type { Tool } from '../types.js'


const paramsSchema = z.object({
  path: z.string().describe('Path to the file to write, relative to workspace root'),
  content: z.string().describe('Content to write into the file'),
})

export const writeFileTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'write_file',
  description: 'Write content to a file (creates or overwrites)',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const fullPath = validatePath(args.path, ctx.workspaceRoot)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, args.content, 'utf-8')
    return `Successfully wrote to #{args.path}`
  }
}
