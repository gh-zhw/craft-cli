// src/tools/edit-file.ts
import { z } from 'zod'
import { readFileSync, writeFileSync } from 'node:fs'
import { validatePath } from '../utils/guard.js'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  path: z.string().describe('Path to the file to edit, relative to workspace root'),
  old_string: z.string().describe('The exact string to be replaced (must be unique in the file)'),
  new_string: z.string().describe('The new string to replace old_string with'),
})

export const editFileTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'edit_file',
  description: 'Replace an exact string in a file with a new string. The old_string must appear exactly once in the file, otherwise the operation is rejected.',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const fullPath = validatePath(args.path, ctx.workspaceRoot)
    const content = readFileSync(fullPath, 'utf-8')

    // Count occurrences by splitting
    const occurrences = content.split(args.old_string).length - 1
    if (occurrences === 0) {
      throw new Error(`old_string not found in ${args.path}`)
    }
    if (occurrences > 1) {
      throw new Error(`old_string appears ${occurrences} times in ${args.path}, must be unique.`)
    }

    // Request user approval (currently always approves)
    const approved = await ctx.askApproval(`Replace the unique occurrence of "${args.old_string}" with "${args.new_string}" in ${args.path}?`)

    if (!approved) {
      return 'Edit cancelled by user.'
    }

    const newContent = content.replace(args.old_string, args.new_string)
    writeFileSync(fullPath, newContent, 'utf-8')
    return `Successfully edited ${args.path}: replaced old string with new string.`
  }
}
