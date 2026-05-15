// src/agent-runtime.ts
import type {
  Message, ToolCall, LLMResponse,
  AgentRuntimeOptions, AgentRunResult, AgentEvents, ApprovalAction,
} from './types.js'
import type { LLMProvider } from './llm/provider.js'
import type { ToolRegistry } from './tools/registry.js'
import { getToolSchemas } from './tools/registry.js'
import { getPermissionLevel, getApprovalMessage } from './utils/permission.js'
import { EventEmitter } from './utils/event-emitter.js'

export class AgentRuntime {
  private provider: LLMProvider
  private registry: ToolRegistry
  private toolContext: any
  private config: AgentRuntimeOptions['config']
  private messages: Message[]
  private totalInput = 0
  private totalOutput = 0
  private consecutiveDenials = 0
  private totalToolCalls = 0
  private sessionApprovedTools = new Set<string>()
  private events = new EventEmitter<AgentEvents>()

  constructor(options: AgentRuntimeOptions) {
    this.provider = options.provider
    this.registry = options.registry
    this.toolContext = options.toolContext
    this.config = options.config
    this.messages = [
      { role: 'system', content: options.systemPrompt },
      ...(options.initialMessages ?? []),
    ]
  }

  on<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]) {
    this.events.on(event, listener)
  }

  getMessages(): Message[] {
    return this.messages
  }

  getTokenUsage() {
    return { input: this.totalInput, output: this.totalOutput }
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    // Add user message
    this.messages.push({ role: 'user', content: userMessage })

    // Reset per-run counters
    this.consecutiveDenials = 0
    this.totalToolCalls = 0

    const toolSchemas = getToolSchemas(this.registry)

    while (true) {
      const callbacks = {
        onText: (chunk: string) => {
          this.events.emit('text', chunk)
        },
      }

      const response: LLMResponse = await this.provider.chat(
        this.messages,
        toolSchemas,
        callbacks,
      )

      if (response.text) {
        this.events.emit('streamFinished')
      }

      this.totalInput += response.usage.input
      this.totalOutput += response.usage.output

      if (response.stopReason === 'tool_use') {
        this.messages.push({
          role: 'assistant',
          content: response.text,
          toolCalls: response.toolCalls,
          contentBlocks: response.contentBlocks,
        })

        const terminationResult = await this.executeToolCalls(response.toolCalls)
        if (terminationResult) {
          return {
            finalText: terminationResult.message,
            updatedMessages: this.messages,
            totalUsage: { input: this.totalInput, output: this.totalOutput },
            terminationReason: terminationResult.reason,
          }
        }
        continue
      }

      // End of turn / max_tokens
      if (response.stopReason === 'max_tokens') {
        this.events.emit('terminated', 'max_tokens')
      }

      this.messages.push({
        role: 'assistant',
        content: response.text,
        contentBlocks: response.contentBlocks,
      })

      return {
        finalText: response.text,
        updatedMessages: this.messages,
        totalUsage: { input: this.totalInput, output: this.totalOutput },
        terminationReason: response.stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn',
      }
    }
  }

  // Reset the entire session (clear history and whitelist)
  reset(systemPrompt: string, initialMessages: Message[] = []) {
    this.messages = [
      { role: 'system', content: systemPrompt },
      ...initialMessages,
    ];
    this.totalInput = 0;
    this.totalOutput = 0;
    this.consecutiveDenials = 0;
    this.totalToolCalls = 0;
    this.sessionApprovedTools.clear();
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
  ): Promise<{ message: string; reason: AgentRunResult['terminationReason'] } | null> {
    for (const tc of toolCalls) {
      if (this.config.maxToolCallsPerTurn > 0 && this.totalToolCalls >= this.config.maxToolCallsPerTurn) {
        this.messages.push({
          role: 'tool',
          content: 'Error: Task terminated before this tool could execute.',
          tool_call_id: tc.id,
        })
        return {
          message: 'Task terminated: maximum number of tool calls reached.',
          reason: 'max_tool_calls',
        }
      }
      this.totalToolCalls++

      const tool = this.registry.get(tc.name)
      if (!tool) {
        this.messages.push({
          role: 'tool',
          content: `Error: Unknown tool requested: ${tc.name}`,
          tool_call_id: tc.id,
        })
        continue
      }

      const level = getPermissionLevel(tc.name, tc.arguments, this.toolContext.config)
      const approvalMessage = getApprovalMessage(tc.name, tc.arguments, level)

      const isAutoApproved =
        level === 'auto' ||
        this.toolContext.config.autoApprove ||
        this.sessionApprovedTools.has(tc.name)

      // Fire toolStart event (UI spinner)
      this.events.emit('toolStart', tc.name, tc.arguments)

      let shouldExecute = true
      if (!isAutoApproved) {
        const action: ApprovalAction = await this.toolContext.askApproval({
          toolName: tc.name,
          args: tc.arguments,
          message: approvalMessage,
          level,
        })

        switch (action) {
          case 'approve_all':
            this.sessionApprovedTools.add(tc.name)
            break
          case 'approve':
            break
          case 'deny':
            this.consecutiveDenials++
            this.messages.push({
              role: 'tool',
              content: 'Error: User denied the operation.',
              tool_call_id: tc.id,
            })
            shouldExecute = false
            if (this.config.maxConsecutiveDenials > 0 && this.consecutiveDenials >= this.config.maxConsecutiveDenials) {
              return {
                message: 'Task terminated: too many consecutive tool call denials.',
                reason: 'consecutive_denials',
              }
            }
            break
          case 'stop':
            this.messages.push({
              role: 'tool',
              content: 'Error: Task stopped by user.',
              tool_call_id: tc.id,
            })
            return {
              message: 'Task stopped by user.',
              reason: 'user_stop',
            }
        }
      }

      if (shouldExecute) {
        this.consecutiveDenials = 0
        try {
          const result = await tool.execute(tc.arguments, this.toolContext)
          this.events.emit('toolEnd', tc.name, result)
          this.messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          })
        } catch (err: any) {
          this.events.emit('toolEnd', tc.name, err.message, true)
          this.messages.push({
            role: 'tool',
            content: `Error: ${err.message}`,
            tool_call_id: tc.id,
          })
        }
      }
    }
    return null
  }
}
