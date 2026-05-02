// src/tools/run-shell.ts
import { z } from 'zod'
import { exec } from 'node:child_process'
import { isDangerousCommand, sanitizeCommand } from '../utils/guard.js'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout: z.number().optional().describe('Timeout in seconds (default 30)')
})

function execAsync(command: string, options: { cwd: string; timeout: number }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error(`Command timed out after ${options.timeout}ms`))
      } else if (error) {
        // Non‑zero exit is not a rejection; we still resolve with stdout/stderr
        resolve({ stdout, stderr });
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

const MAX_OUTPUT_LEN = 8_000

export const runShellTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'run_shell',
  description: 'Execute a shell command in the workspace directory. Returns combined stdout and stderr (truncated at 8KB). Dangerous commands are rejected.',
  parameters: paramsSchema,
  async execute(args, ctx) {
    const command = sanitizeCommand(args.command)
    if (isDangerousCommand(command)) {
      return `Blocked: command matches dangerous pattern.`
    }

    const timeoutSec = args.timeout ?? 30
    const timeoutMs = timeoutSec * 1000

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.workspaceRoot,
        timeout: timeoutMs
      })

      let output = stdout || ''
      if (stderr) {
        output += `\n[stderr]\n${stderr}`
      }
      if (output.length > MAX_OUTPUT_LEN) {
        output = output.substring(0, MAX_OUTPUT_LEN) + '\n... (output truncated)'
      }
      return output || 'Command executed (no output).'
    } catch (err: any) {
      return `Command failed: ${err.message}`
    }
  }
}
