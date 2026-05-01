// src/tools/read-file.ts
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Tool } from '../types.js';


const paramsSchema = z.object({
  path: z.string().describe('Path to the file to read, relative to workspace root'),
})

export const readFileTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const fullPath = resolve(ctx.workspaceRoot, args.path)
    const content = readFileSync(fullPath, 'utf-8')
    return content
  }
}
