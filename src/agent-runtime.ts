// src/agent-runtime.ts
import type {
  Message, ToolCall, LLMResponse,
  AgentRuntimeOptions, AgentRunResult, AgentEvents, ApprovalAction,
  RuntimeConfig,
  ToolContext,
} from './types.js'
import type { LLMProvider } from './llm/provider.js'
import type { ToolRegistry } from './tools/registry.js'
import { getToolSchemas } from './tools/registry.js'
import { getPermissionLevel, getApprovalMessage } from './utils/permission.js'
import { EventEmitter } from './utils/event-emitter.js'
import { TokenCounter } from './utils/token-counter.js'
import { ContextCompressionConfig } from './utils/config.js'

export interface SubAgentOptions {
  name: string;
  task: string;
  maxToolCalls?: number;
}

export class AgentRuntime {
  private provider: LLMProvider
  private config: AgentRuntimeOptions['config']
  private compressionConfig: ContextCompressionConfig

  private registry: ToolRegistry
  private toolContext: ToolContext
  private totalToolCalls = 0
  private consecutiveDenials = 0
  private sharedApprovedTools: Set<string>

  private messages: Message[]
  private tokenCounter: TokenCounter
  private contextTokens = 0
  private lastTurnUsage = { input: 0, output: 0 }
  private totalInput = 0
  private totalOutput = 0

  private events = new EventEmitter<AgentEvents>()

  private agentName?: string

  constructor(options: AgentRuntimeOptions) {
    this.provider = options.provider
    this.registry = options.registry
    this.config = options.config
    this.messages = [
      { role: 'system', content: options.systemPrompt },
      ...(options.initialMessages ?? []),
    ]
    this.sharedApprovedTools = options.sessionApprovedTools ?? new Set<string>()
    this.compressionConfig = options.config.contextCompression
    this.tokenCounter = this.provider.createTokenCounter()

    // Inject this into the original toolContext (only if not a sub-agent)
    if (!options.isSubAgent) {
      options.toolContext.agentRuntime = this
    }
    this.toolContext = options.toolContext
    this.agentName = options.agentName
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
  getLastTurnUsage() {
    return this.lastTurnUsage
  }

  getAgentName() {
    return this.agentName
  }

  updateConfig(config: RuntimeConfig) {
    this.config = config
    this.compressionConfig = config.contextCompression
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    // Reset per-run counters
    this.lastTurnUsage = { input: 0, output: 0 }
    this.consecutiveDenials = 0
    this.totalToolCalls = 0

    // Add user message
    this.messages.push({ role: 'user', content: userMessage })

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
        this.config.maxTokens,
        callbacks,
      )
      if (response.text) {
        this.events.emit('streamFinished')
      }

      this.addTokenUsage(response.usage)

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

          // For max_tool_calls or consecutive_denials, let the model provide the final answer based on existing information.
          if (
            terminationResult.reason === 'max_tool_calls' ||
            terminationResult.reason === 'consecutive_denials'
          ) {
            // Add a prompt message asking the model to summarize
            this.messages.push({
              role: 'user',
              content: terminationResult.message +
                'Since this round of task has reached the maximum tool call limit, the task are paused. Please summarize previous messages WITHOUT calling any tools.',
            })

            // Run a tool-free call to generate a summary from the model
            const finalResponse = await this.provider.chat(
              this.messages,
              [],
              this.config.maxTokens,
              callbacks,
            )
            if (finalResponse.text) {
              this.events.emit('streamFinished')
            }

            this.addTokenUsage(finalResponse.usage)

            this.messages.push({
              role: 'assistant',
              content: finalResponse.text,
              contentBlocks: finalResponse.contentBlocks,
            })

            return {
              finalText: finalResponse.text,
              updatedMessages: this.messages,
              totalUsage: this.lastTurnUsage,
              terminationReason: terminationResult.reason,
            }
          }
          return {
            finalText: terminationResult.message,
            updatedMessages: this.messages,
            totalUsage: this.lastTurnUsage,
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

      this.contextTokens = await this.tokenCounter.countMessages(this.messages)

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
    ]
    this.totalInput = 0
    this.totalOutput = 0
    this.lastTurnUsage = { input: 0, output: 0 }
    this.contextTokens = 0
    this.consecutiveDenials = 0
    this.totalToolCalls = 0
  }

  /**
   * Manually add token usage (e.g., from sub-agents) to the current run's counter.
   */
  addTokenUsage(usage: { input: number; output: number }) {
    // Cumulative consumption for this round
    this.lastTurnUsage.input += usage.input
    this.lastTurnUsage.output += usage.output

    this.totalInput += usage.input
    this.totalOutput += usage.output
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
  ): Promise<{ message: string; reason: AgentRunResult['terminationReason'] } | null> {
    let shouldStop = false
    let terminationReason: AgentRunResult['terminationReason']
    let terminationMessage: string

    for (const tc of toolCalls) {
      // If termination has been triggered, generate cancellation results only for remaining calls and proceed.
      if (shouldStop) {
        this.messages.push({
          role: 'tool',
          content: 'Error: Task terminated before this tool could execute.',
          tool_call_id: tc.id,
        })
        continue
      }

      if (this.config.maxToolCallsPerTurn > 0 && this.totalToolCalls >= this.config.maxToolCallsPerTurn) {
        shouldStop = true
        terminationReason = 'max_tool_calls'
        terminationMessage = 'Task terminated: maximum number of tool calls reached.'
        this.messages.push({
          role: 'tool',
          content: 'Error: Task terminated before this tool could execute.',
          tool_call_id: tc.id,
        })
        continue
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
        this.sharedApprovedTools.has(tc.name)

      // Fire toolStart event (UI spinner)
      this.events.emit('toolStart', tc.name, tc.arguments)

      let shouldExecute = true
      if (!isAutoApproved) {
        const action: ApprovalAction = await this.toolContext.askApproval({
          toolName: tc.name,
          args: tc.arguments,
          message: approvalMessage,
          level,
          agentName: this.agentName,
        })

        switch (action) {
          case 'always':
            this.sharedApprovedTools.add(tc.name)
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
              shouldStop = true
              terminationReason = 'consecutive_denials'
              terminationMessage = 'Task terminated: too many consecutive tool call denials.'
            }
            break
          case 'stop':
            this.messages.push({
              role: 'tool',
              content: 'Error: Task stopped by user.',
              tool_call_id: tc.id,
            })
            shouldStop = true
            terminationReason = 'user_stop'
            terminationMessage = 'Task stopped by user.'
            shouldExecute = false
            break
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

    if (shouldStop) {
      return { message: terminationMessage!, reason: terminationReason! }
    }
    return null
  }

  /**
   * Create a sub-agent runtime with limited tools and context.
   */
  static createSubRuntime(
    mainRuntime: AgentRuntime,
    options: SubAgentOptions,
    allowedTools?: ToolRegistry,
  ): AgentRuntime {
    const systemPrompt = `You are a sub-agent named "${options.name}". 
Your only job is to execute the given task and return a final report.
You have access to some **read-only**  tools. Do not ask for clarification; just do your best.
Respond with the final answer in a clear, concise format.
Do not use any tools that are not explicitly provided.`

    const subConfig: RuntimeConfig = {
      ...mainRuntime.config,
      maxToolCallsPerTurn: options.maxToolCalls ?? mainRuntime.config.maxToolCallsPerTurn,
    }

    const subToolContext = {
      ...mainRuntime.toolContext,
      config: {
        ...mainRuntime.toolContext.config,
        autoApprove: true,     // Read-only subagents
      },
    }

    return new AgentRuntime({
      provider: mainRuntime.provider,
      registry: allowedTools ?? mainRuntime.registry,
      toolContext: subToolContext,
      systemPrompt,
      config: subConfig,
      initialMessages: [],
      agentName: options.name,
      isSubAgent: true,
      sessionApprovedTools: mainRuntime.sharedApprovedTools,
    })
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
      const max_tokens = this.compressionConfig.summaryMaxTokens
      const summary = await this.provider.chat([
        { role: 'user', content: `Please summarize the following conversation into a concise paragraph, retaining key facts, decisions, and context:\n\n${transcript}` }
      ], [], max_tokens, { onText: undefined })  // No tool or callback required
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
