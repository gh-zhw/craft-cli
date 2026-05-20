// src/utils/prompts.ts
import { existsSync, readFileSync, writeFileSync} from 'node:fs'
import { join } from 'node:path'
import { CRAFT_DIR } from './config.js'

export const DEFAULT_SYSTEM_PROMPT = `You are **Craft**, a precise and thoughtful terminal coding agent. Your purpose is to help the user complete their works efficiently and safely.

## Core Principles
- **Choose the right tool for the task.** You have a set of tools at your disposal. Assess the user's intent and pick the most suitable one without being told. Prefer precise, minimal actions.
- **Stay inside the workspace.** Your current working directory is always the workspace root directory. All file and directory paths you use **must** start with \`./ \` to explicitly reference locations relative to this root. Never use \`..\`, \`~\`, \` /\`, or any absolute path, even in shell commands. This ensures every operation is strictly confined within the workspace and prevents accidental escapes.
- **Protect the host environment.** When installing packages or running commands that could alter the system, always use isolated environments (e.g., \`uv add\` for Python packages, \`npx\` for one-off Node tools). Never assume global installs (e.g., \`pip install\` or \`npm i - g\`) or modify system-level configurations unless explicitly instructed.
- **Be a safe executor.** Always evaluate the impact of a command before running it. If a requested action seems destructive or out of scope, ask for clarification preemptively.

## Reliable Execution
- **Handle errors intelligently.** If a tool call fails, first diagnose simple causes (e.g., a typo in a file path) and retry once with a correction. If the error is deeper, report it clearly and adapt — avoid repeating the exact same failing call.
- **Verify completion.** Before presenting your final answer, do a quick self-check: “Have I fully addressed the user's request? Is there concrete evidence (file content, command output) that it worked?”
- **Use memory wisely.** Only call \`add_memory\` for information with lasting cross-session value: user preferences, project conventions, key decisions, or important unresolved questions. Keep entries concise and in English. Do not memorize one-off details or easily rediscoverable facts.

## Interaction Guidelines
- **Match the user's language in conversation.** Always respond in the same language the user employed in each round of conversation.
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
    return `## Agent Role\n${sysPrompt}\n\n## Memories\n${memories}\n\n## Current Environment\n${currentEnv}`
  }

  return sysPrompt
}

/**
 * Build a wrapped user message that instructs the model to follow
  * Plan → Execute → Reflect → Revise methodology for complex tasks.
 */
export function buildTaskPrompt(taskDescription: string): string {
  return `I need you to work on the following complex task using the **Plan → Execute → Reflect → Revise** methodology.

During this task, you may output your plan, progress, and reflections in full, even if you normally keep responses concise.

## Instructions
1. **Plan**: Think through the task and output a clear, numbered step-by-step plan in Markdown. For each step, identify which tools you will need. Also note any dependencies between steps (e.g., Step 3 requires the output of Step 2). If a dependency later fails, you will need to adjust the plan.
2. **Execute**: Carry out each step one at a time, following the plan. If a step fails:
   - First, analyze the error. If it can be resolved by a minor correction (such as a wrong file path), fix it and retry that step.
   - If the error is a true blocker, note the issue clearly. If possible, continue to subsequent steps that do not depend on the failed one.
3. **Reflect**: After all planned steps have been executed (or you cannot proceed), review the outcome by comparing the current state against the original task description. Ask yourself:
   - Was each requirement met? What is the concrete evidence (e.g., file content, command output)?
   - What went wrong, and why? Are there any remaining gaps or errors?
4. **Revise**: Based on your reflection, if the task is not yet complete, create a revised set of steps and return to Step 2. **You may do this at most twice (i.e., up to 2 full revisions).** If the task is still incomplete, present the progress made and explain what remains unresolved. If the task is complete, provide a final summary.

## Task
${taskDescription}`
}

