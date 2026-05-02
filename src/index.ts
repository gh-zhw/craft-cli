// src/index.ts
import { LLMProvider } from './llm/provider.js'
import { createToolRegistry, registerTool } from './tools/registry.js'
import { readFileTool } from './tools/read-file.js'
import { writeFileTool } from './tools/write-file.js'
import { editFileTool } from './tools/edit-file.js';
import { runShellTool } from './tools/run-shell.js';
import { grepTool } from './tools/grep.js';
import { globTool } from './tools/glob.js';
import { agentLoop } from './agent-loop.js'
import type { ToolContext } from './types.js'

// Import .env
import 'dotenv/config';

const workspaceRoot = process.cwd()

// A placeholder approval function - always approves for now
const dummyContext: ToolContext = {
  workspaceRoot,
  askApproval: async(_message: string) => true,
}

async function main() {
  console.log('craft-cli is ready.\n')

  // Initialize LLM provider (reads ANTHROPIC_API_KEY from env)
  const provider = new LLMProvider({
    thinking: {type: 'disabled'},
  })

  // Set up tool registry
  const registry = createToolRegistry()
  registerTool(registry, readFileTool)
  registerTool(registry, writeFileTool)
  registerTool(registry, editFileTool)
  registerTool(registry, runShellTool)
  registerTool(registry, grepTool)
  registerTool(registry, globTool)

  // Hard-coded task for the first closed loop
  const systemPrompt = 'You are a precise terminal assistant. Use tools when needed. When reading/writing files, always use relative paths from the workspace root. When searching, prefer grep and glob. Execute shell commands only when absolutely required.'
  const userMessage = 'Find all .ts files that contain the word "agent".'

  console.log(`User: ${userMessage}\n`)

  try {
    const finalAnswer = await agentLoop(provider, registry, systemPrompt, userMessage, dummyContext)
    console.log(`\nAssistant:\n${finalAnswer}`)
  } catch (error) {
    console.error('Agent loop failed:', error)
    process.exit(1)
  }
}

main()
