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
import { TokenCounter } from './utils/token-counter.js'
import { ContextCompressionConfig } from './utils/config.js'

export class AgentRuntime {
  private provider: LLMProvider
  private config: AgentRuntimeOptions['config']
  private compressionConfig: ContextCompressionConfig

  private registry: ToolRegistry
  private toolContext: any
  private totalToolCalls = 0
  private consecutiveDenials = 0
  private sessionApprovedTools = new Set<string>()

  private messages: Message[]
  private tokenCounter: TokenCounter
  private contextTokens = 0
  private lastApiUsage = { input: 0, output: 0 }
  private totalInput = 0
  private totalOutput = 0

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
    this.compressionConfig = options.config.contextCompression
    this.tokenCounter = this.provider.createTokenCounter()
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
  getContextTokens() {
    return this.contextTokens
  }
  getLastApiUsage() {
    return this.lastApiUsage
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    // Add user message
    this.messages.push({ role: 'user', content: userMessage })

    // Reset per-run counters
    this.consecutiveDenials = 0
    this.totalToolCalls = 0

    const toolSchemas = getToolSchemas(this.registry)

    while (true) {
      // Context compression check
      if (this.config.contextCompression.enabled) {
        await this.maybeCompactContext()
      }

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

      this.lastApiUsage = { input: response.usage.input, output: response.usage.output }
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
          this.events.emit('terminated', terminationResult.reason)
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
      const reason = response.stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn'
      this.events.emit('terminated', reason)

      this.messages.push({
        role: 'assistant',
        content: response.text,
        contentBlocks: response.contentBlocks,
      })

      this.contextTokens = await this.tokenCounter.countMessages(this.messages);

      return {
        finalText: response.text,
        updatedMessages: this.messages,
        totalUsage: { input: this.totalInput, output: this.totalOutput },
        terminationReason: reason,
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

  private async maybeCompactContext(force: boolean = false) {
    const limit = this.provider.getModelMaxTokens()
    this.contextTokens = await this.tokenCounter.countMessages(this.messages)
    const ratio = this.contextTokens / limit
    if (ratio < this.compressionConfig.lightTrimThreshold && !force) return

    // Light Pruning
    this.lightTrim()
    this.contextTokens = await this.tokenCounter.countMessages(this.messages)
    const newRatio = this.contextTokens / limit

    if (newRatio >= this.compressionConfig.deepCompactThreshold || force) {
      // Deep Compression
      await this.deepCompact()
      this.contextTokens = await this.tokenCounter.countMessages(this.messages)
    }

    this.events.emit('contextCompacted', {
      contextTokens: this.contextTokens,
      limit: this.provider.getModelMaxTokens()
    })
  }

  private lightTrim() {
    const keepTurns = this.compressionConfig.keepRecentTurns
    // Find the latest messages from the first keepTurns users, retain them, and all subsequent messages
    const userIndices: number[] = []
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') userIndices.push(i)
      if (userIndices.length >= keepTurns) break
    }
    
    // If the number of rounds is insufficient, trim the entire history.
    // userIndices[0] is the index of the latest user message.
    const cutoff = userIndices.length >= keepTurns
      ? userIndices[userIndices.length - 1]
      : userIndices[0]
    // For tool messages before the cutoff, replace the content with a placeholder
    // messages[0] is a system message
    for (let i = 1; i < cutoff; i++) {
      if (this.messages[i].role === 'tool') {
        this.messages[i].content = '[tool result truncated due to context limit]'
        delete this.messages[i].contentBlocks
      }
    }
  }

  private async deepCompact() {
    const keepTurns = this.compressionConfig.keepRecentTurns
    const userIndices: number[] = []
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') userIndices.push(i)
      if (userIndices.length >= keepTurns) break
    }

    const cutoff = userIndices.length >= keepTurns
      ? userIndices[userIndices.length - 1]
      : userIndices[0]
    // Get early messages (excluding system messages)
    const earlyMessages = this.messages.slice(1, cutoff)
    // Build text for the summary
    let transcript = ''
    for (const msg of earlyMessages) {
      transcript += `${msg.role}: ${msg.content}\n`
    }

    try {
      const summary = await this.provider.chat([
        { role: 'user', content: `Please summarize the following conversation into a concise paragraph, retaining key facts, decisions, and context:\n\n${transcript}` }
      ], [], { onText: undefined })  // No tool or callback required
      const summaryText = summary.text

      // Rebuild messages
      const systemMsg = this.messages[0]
      const recentMsgs = this.messages.slice(cutoff)
      this.messages = [
        systemMsg,
        { role: 'user', content: `[Conversation summary]\n${summaryText}` },
        ...recentMsgs,
      ]
    } catch (e) {
      console.error('Context compression failed:', e)
    }
  }

  async compactNow() {
    if (this.config.contextCompression.enabled) {
      await this.maybeCompactContext(true)
    } else {
      console.log('Context compression is disabled.')
    }
  }
}
