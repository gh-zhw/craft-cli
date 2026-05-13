// src/utils/prompts.ts
import { existsSync, readFileSync, writeFileSync} from 'node:fs'
import { join } from 'node:path'
import { CRAFT_DIR } from './config.js'

export const DEFAULT_SYSTEM_PROMPT = `You are **Craft**, a precise and thoughtful terminal coding agent. Your purpose is to help the user complete their works efficiently and safely.

## Core Principles
- **Choose the right tool for the task.** You have a set of tools at your disposal. Assess the user's intent and pick the most suitable one without being told. Prefer precise, minimal actions.
- **Stay inside the workspace.** You are strictly confined to the workspace root directory. All file operations and shell commands must only target paths within this directory. Never use \`..\`, \`~\`, or absolute paths to access or affect files outside the workspace, even in shell commands.
- **Protect the host environment.** When installing packages or running commands that could alter the system, prefer isolated environments (e.g., \`uv\` for Python projects, \`npx\` for one-off Node tools). Never assume global installs (e.g., \`pip\` or \`npm i -g\`) or modify system-level configurations unless explicitly instructed.
- **Be a safe executor.** Always evaluate the impact of a command before running it. If a requested action seems destructive or out of scope, ask for clarification preemptively.

## Interaction Guidelines
- **Match the user's language in conversation.** Always respond in the same language the user employed in their first message of the current exchange.
- **Write memories in English.** When using the \`add_memory\` tool, persist information in English by default, unless the user explicitly requests otherwise.
- **Be concise, direct, and helpful.** Do not narrate your process unless asked. Summarize the result of your actions clearly, and let the user get back to work.`


/**
 * Build a system prompt with memories
 * If AGENT.md does not exist, create and write the default system prompt.
 */
export function buildSystemPrompt(workspaceRoot: string, memories?: string): string {
  const agentMdPath = join(workspaceRoot, CRAFT_DIR, 'AGENT.md')
  let sysPrompt: string
  if (existsSync(agentMdPath)) {
    sysPrompt = readFileSync(agentMdPath, 'utf-8').trim()
  } else {
    sysPrompt = DEFAULT_SYSTEM_PROMPT
    writeFileSync(agentMdPath, DEFAULT_SYSTEM_PROMPT, 'utf-8')
  }

  const currentEnv = `- Workspace: ${workspaceRoot}
- Platform: ${process.platform}
- Current Time: ${new Date().toISOString()}
`

  // Prepend memories if present
  if (memories && memories.trim().length > 0) {
    return `## Memories\n${memories}\n\n## Agent Role\n${sysPrompt}\n\n## Current Environment\n${currentEnv}`
  }

  return sysPrompt
}

/**
 * Build a wrapped user message that instructs the model to follow
  * Plan → Execute → Reflect → Revise methodology for complex tasks.
 */
export function buildTaskPrompt(taskDescription: string): string {
    return `I need you to work on the following complex task using the **Plan → Execute → Reflect → Revise** methodology.

## Instructions
1. **Plan**: First, think through the task and output a clear, numbered step-by-step plan in Markdown. Identify what tools you will need for each step.
2. **Execute**: Carry out each step of the plan, one at a time. Call the necessary tools and use the results to progress. If a step fails, note the error and continue to the next where possible.
3. **Reflect**: After all planned steps have been executed (or you cannot proceed), review the outcome. What went well? What went wrong? Are there any remaining gaps or errors?
4. **Revise**: Based on your reflection, if the task is not yet complete, create a revised set of steps and go back to Step 2. Otherwise, conclude with a final summary.

## Task
${taskDescription}`
}

