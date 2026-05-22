// src/tools/task-subagent.ts
import { z } from 'zod'
import { AgentRuntime } from '../agent-runtime.js'
import { createToolRegistry, registerTool } from './registry.js'
import { readFileTool } from './read-file.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import { webSearchTool } from './web-search.js'
import { webFetchTool } from './web-fetch.js'
import { runShellTool } from './run-shell.js'
import { getCurrentTimeTool } from './get-current-time.js'
import type { Tool, ToolContext } from '../types.js'

// Mapping of all available tools
const ALL_TOOLS: Record<string, Tool> = {
  read_file: readFileTool,
  grep: grepTool,
  glob: globTool,
  web_search: webSearchTool,
  web_fetch: webFetchTool,
  run_shell: runShellTool,
  get_current_time: getCurrentTimeTool,
}

const paramsSchema = z.object({
  name: z.string().describe("A short name for this sub-agent (e.g., 'bug-finder')."),
  task: z.string().describe("Clear, detailed instructions for the sub-agent, including expected output format."),
  tools: z.array(z.enum(['read_file', 'grep', 'glob', 'web_search', 'web_fetch', 'run_shell', 'get_current_time'])).optional().describe("Allowed tools (default all read-only)."),
})

export const taskSubagentTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'task_subagent',
  description:
    'Create a sub-agent to work on a specific sub-task. The sub-agent has read-only access to files, web search, and optionally shell. It returns a final report. Use this to parallelize work or isolate complex sub-problems.',
  parameters: paramsSchema,
  async execute(args, ctx: ToolContext) {
    const {
      name,
      task,
      tools: allowedToolNames = ['read_file', 'grep', 'glob', 'web_search', 'web_fetch', 'get_current_time'],
    } = args
    const max_time_seconds = ctx.config?.subagents.maxTimeSeconds
    const max_tool_calls = ctx.config?.subagents.maxToolCalls

    if (ctx.config?.subagents?.verbose) {
      console.log(`Sub-agent '${name}' started on task: ${task} (tools: ${allowedToolNames.join(', ')})`)
    }

    // Build filtered tool registry
    const subRegistry = createToolRegistry()
    for (const toolName of allowedToolNames) {
      if (ALL_TOOLS[toolName]) {
        registerTool(subRegistry, ALL_TOOLS[toolName])
      }
    }

    // Get the main AgentRuntime from context
    const mainRuntime = ctx.agentRuntime as AgentRuntime
    if (!mainRuntime || mainRuntime.getAgentName() != 'main') {
      return 'Error: Sub-agent can only be created when running inside the main agent.'
    }

    // 3. Create sub-runtime
    const subRuntime = AgentRuntime.createSubRuntime(
      mainRuntime,
      {
        name,
        task,
        maxTimeSeconds: max_time_seconds,
        maxToolCalls: max_tool_calls,
      },
      subRegistry,
    )

    // 4. Execute with timeout
    const startTime = Date.now()
    try {
      const result = await Promise.race([
        subRuntime.run(task),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Sub-agent '${name}' timed out after ${max_time_seconds}s`)), max_time_seconds * 1000)
        ),
      ])

      if (mainRuntime) {
        mainRuntime.addTokenUsage(result.totalUsage)
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const status = result.terminationReason
        ? ` (terminated: ${result.terminationReason})`
        : ''

      return `Sub-agent '${name}' completed in ${elapsed}s${status}\n` +
        `Tools used: ${result.totalUsage.input + result.totalUsage.output} tokens\n\n` +
        result.finalText
    } catch (error: any) {
      return `Sub-agent '${name}' failed: ${error.message}`
    }
  },
}
