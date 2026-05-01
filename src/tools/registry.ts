// src/tools/registry.ts
import { z } from 'zod';
import type { Tool } from '../types.js';
import type Anthropic from '@anthropic-ai/sdk';

export type ToolRegistry = Map<string, Tool>

/**
 * Create an empty tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new Map()
}

/**
 * Register a tool. Throws if a tool with the same name already exists
 */
export function registerTool(registry: ToolRegistry, tool: Tool): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered.`)
  }
  registry.set(tool.name, tool)
}

/**
 * Convert all registered tools into the format expected by the Anthropic API
 * Uses Zod's built-in toJSONSchema to produce the input_schema
 */
export function getToolSchemas(registry: ToolRegistry): Anthropic.Tool[] {
  return Array.from(registry.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.parameters) as Anthropic.Tool.InputSchema
  }))
}
