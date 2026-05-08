// src/tools/add-memory.ts
import { z } from 'zod'
import { addMemory } from '../utils/memory.js'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  content: z.string().describe('The memory content to persist')
})

export const addMemoryTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'add_memory',
  description: 'Permanently store a piece of information about the user or the project for future sessions. Use this to remember preferences, conventions, or important facts that will be loaded automatically next time you start.',
  parameters: paramsSchema,
  async execute(args, ctx) {
    addMemory(ctx.workspaceRoot, args.content);
    return `Memory saved: "${args.content}"`
  }
}
