// src/tools/read-file.ts
import { z } from 'zod'
import { statSync, createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { validatePath } from '../utils/guard.js'
import type { Tool } from '../types.js'

const MAX_FAST_READ_BYTES = 20 * 1024 * 1024  // 20 MB

const paramsSchema = z.object({
  path: z.string().describe('Path to the file to read, relative to workspace root'),
  offset: z.number().int().min(1).optional().describe('Start line number (1‑based), defaults to 1'),
  limit: z.number().int().min(1).max(2000).optional().describe('Maximum number of lines to return, defaults to 500'),
})

export const readFileTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'read_file',
  description:
    'Read the contents of a file, optionally specifying a line range. ' +
    'Large files (>20 MB) are streamed to prevent memory issues.',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const fullPath = validatePath(args.path, ctx.workspaceRoot)

    let size: number
    try {
      size = statSync(fullPath).size
    } catch {
      throw new Error(`Cannot access file: ${args.path}`)
    }

    const startLine = args.offset ?? 1
    const requestedLimit = args.limit ?? 500

    if (size <= MAX_FAST_READ_BYTES) {
      // Small file: Read once
      const { readFileSync } = await import('node:fs')
      const content = readFileSync(fullPath, 'utf-8')
      const lines = content.split('\n')
      return formatOutput(args.path, lines, startLine, requestedLimit)
    } else {
      // Large file: Rows required for streaming read
      return await streamReadLines(fullPath, args.path, startLine, requestedLimit)
    }
  },
}

function formatOutput(
  filePath: string,
  lines: string[],
  startLine: number,
  limit: number,
): string {
  const totalLines = lines.length
  const endLine = Math.min(startLine + limit - 1, totalLines)

  if (startLine > totalLines) {
    return `File has ${totalLines} lines, start line ${startLine} is out of range.`
  }

  let output = `File: ${filePath} (${totalLines} lines total, showing lines ${startLine}-${endLine})\n`
  for (let i = startLine - 1; i < endLine; i++) {
    output += `${i + 1}: ${lines[i]}\n`
  }

  if (endLine < totalLines) {
    output += `... (${totalLines - endLine} more lines, use offset=${endLine + 1} to continue)`
  }

  return output
}

async function streamReadLines(
  fullPath: string,
  displayPath: string,
  startLine: number,
  limit: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(fullPath, { encoding: 'utf-8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    const selectedLines: string[] = []
    let totalLines = 0

    rl.on('line', (line) => {
      totalLines++
      if (totalLines >= startLine && selectedLines.length < limit) {
        selectedLines.push(line)
      }
    })

    rl.on('close', () => {
      let output = `File: ${displayPath} (large file, ${totalLines} lines scanned)\n`
      if (totalLines < startLine) {
        output += `Start line ${startLine} is out of range (only ${totalLines} lines).`
        resolve(output)
        return
      }
      const endLine = startLine + selectedLines.length - 1
      output += `Showing lines ${startLine}-${endLine}\n`
      selectedLines.forEach((line, idx) => {
        output += `${startLine + idx}: ${line}\n`
      })
      if (totalLines > startLine + selectedLines.length - 1) {
        output += `... (more lines available, use offset=${endLine + 1} to continue)`
      }
      resolve(output)
    })

    rl.on('error', reject)
  })
}
