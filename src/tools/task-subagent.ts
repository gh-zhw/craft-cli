// src/tools/task-subagent.ts
import { z } from 'zod'
import { AgentRuntime } from '../agent-runtime.js'
import { createToolRegistry, registerTool } from './registry.js'
import { readFileTool } from './read-file.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import { webSearchTool } from './web-search.js'
import { webFetchTool } from './web-fetch.js'
import { getCurrentTimeTool } from './get-current-time.js'
import type { Tool, ToolContext } from '../types.js'

// Mapping of all available tools
const ALL_TOOLS: Record<string, Tool> = {
  read_file: readFileTool,
  grep: grepTool,
  glob: globTool,
  web_search: webSearchTool,
  web_fetch: webFetchTool,
  get_current_time: getCurrentTimeTool,
}
const TOOL_NAMES = Object.keys(ALL_TOOLS) as [string, ...string[]]

const subagentSchema = z.object({
  name: z.string().describe("Unique short name for this sub-agent."),
  task: z.string().describe("Detailed instructions, including expected output format."),
  tools: z.array(z.enum(TOOL_NAMES)).optional().describe("Allowed tools (default: all read-only tools)."),
})

const paramsSchema = z.object({
  subagents: z.array(subagentSchema).min(1).describe("List of sub-agents to run in parallel."),
})

export const taskSubagentTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'task_subagent',
  description:
    `Run multiple **read-only** sub-agents in parallel, each with a specific sub-task. Sub-agents can read files, search code, browse the web, and check the current time. They cannot modify files, execute shell commands, or change the workspace in any way. Each sub-agent returns a text report, which is summarized for you. Use this to parallelize independent research, analysis, or code exploration tasks.`,
  parameters: paramsSchema,
  async execute(args, ctx: ToolContext) {
    const { subagents } = args

    const maxParallel = ctx.config?.subagents?.maxParallel ?? 5
    if (subagents.length > maxParallel) {
      return `Error: Too many sub-agents. Maximum allowed is ${maxParallel}.`
    }

    // 1. Validate uniqueness of names
    const names = subagents.map((s) => s.name)
    if (new Set(names).size !== names.length) {
      return 'Error: Sub-agent names must be unique.'
    }

    // 2. Get main AgentRuntime
    const mainRuntime = (ctx as any).agentRuntime as AgentRuntime
    if (!mainRuntime) {
      return 'Error: Sub-agents can only be created when running inside the main agent.'
    }

    // 3. Create sub-runtimes for each sub-agent
    const subRuntimes: { name: string; runtime: AgentRuntime; task: string; timeout: number }[] = []
    for (const sub of subagents) {
      const allowedToolNames = sub.tools ?? TOOL_NAMES
      const subRegistry = createToolRegistry()
      for (const toolName of allowedToolNames) {
        if (ALL_TOOLS[toolName]) {
          registerTool(subRegistry, ALL_TOOLS[toolName])
        }
      }

      const subRuntime = AgentRuntime.createSubRuntime(
        mainRuntime,
        {
          name: sub.name,
          task: sub.task,
          maxToolCalls: ctx.config?.subagents?.maxToolCalls ?? 8,
        },
        subRegistry,
      )

      const perAgentTimeoutSec = ctx.config?.subagents?.maxTimeSeconds ?? 120
      const perAgentTimeoutMs = perAgentTimeoutSec * 1000

      subRuntimes.push({
        name: sub.name,
        runtime: subRuntime,
        task: sub.task,
        timeout: perAgentTimeoutMs,
      })
    }

    // 4. Execute all in parallel with individual timeouts
    const startTime = Date.now()
    const results = await Promise.allSettled(
      subRuntimes.map(({ runtime, task, timeout }) =>
        Promise.race([
          runtime.run(task),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Sub-agent timed out')), timeout)
          ),
        ])
      )
    )

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    // 5. Process results and format report
    const reportLines: string[] = [`## Sub-agents Report (completed in ${elapsed}s)\n`]
    let allSuccess = true

    for (let i = 0; i < subagents.length; i++) {
      const sub = subagents[i]
      const result = results[i]
      let statusLine = `- **${sub.name}**`

      if (result.status === 'fulfilled') {
        const res = result.value
        if (res.finalText && res.terminationReason) {
          // Success
          const outputPreview = res.finalText.length > 200
            ? res.finalText.slice(0, 200) + '...'
            : res.finalText
          statusLine += ` Success — ${outputPreview}`
          // Accumulate token usage
          if (mainRuntime) {
            mainRuntime.addTokenUsage(res.totalUsage)
          }
        } else {
          // Error or empty
          statusLine += ` Error — ${res.finalText || 'Unknown error'}`
          allSuccess = false
        }
      } else {
        statusLine += ` Error — Timed out or failed: ${result.reason}`
        allSuccess = false
      }
      reportLines.push(statusLine)
    }

    if (results.every((r) => r.status === 'rejected')) {
      reportLines.push('\nAll sub-agents failed or timed out. No results could be obtained.')
    } else if (!allSuccess) {
      reportLines.push('\nSome sub-agents failed – review individual statuses above.')
    }

    return reportLines.join('\n')
  },
}