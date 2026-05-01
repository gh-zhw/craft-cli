// src/index.ts
import { LLMProvider } from './llm/provider.js';
import { createToolRegistry, registerTool } from './tools/registry.js';
import { readFileTool } from './tools/read-file.js';
import { writeFileTool } from './tools/write-file.js';
import { agentLoop } from './agent-loop.js';
import type { ToolContext } from './types.js';

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
  const provider = new LLMProvider()

  // Set up tool registry
  const registry = createToolRegistry()
  registerTool(registry, readFileTool)
  registerTool(registry, writeFileTool)

  // Hard-coded task for the first closed loop
  const systemPrompt = 'You are a precise terminal assistant. Use tools when needed and return exactly what is asked.'
  const userMessage = 'Read the file named AGENT.md and return its first 3 lines. Only return those lines, nothing else.'

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
