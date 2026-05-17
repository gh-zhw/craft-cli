// src/utils/token-counter.ts
import type { Message } from '../types.js'

export class TokenCounter {
  private ready = false
  private model: string
  private anthropicTokenizer: any
  private tiktokenEncoding: any

  constructor(model: string) {
    this.model = model
  }

  private async initTokenizer() {
    if (this.ready) return
    this.ready = true
    const model = this.model.toLowerCase()
    if (model.includes('claude') || model.includes('deepseek')) {
      try {
        const { countTokens } = await import('@anthropic-ai/tokenizer')
        this.anthropicTokenizer = countTokens
      } catch (e) {
        // Fallback: Use a simple estimate
        this.anthropicTokenizer = null
      }
    } else {
      try {
        const { get_encoding } = await import('tiktoken')
        this.tiktokenEncoding = get_encoding('cl100k_base')
      } catch (e) {
        this.tiktokenEncoding = null
      }
    }
  }

  async countText(text: string): Promise<number> {
    await this.initTokenizer()
    if (this.anthropicTokenizer) {
      return this.anthropicTokenizer(text)
    } else if (this.tiktokenEncoding) {
      return this.tiktokenEncoding.encode(text).length
    } else {
      // Rough estimate: 1 token is saved for every 4 characters.
      return Math.ceil(Buffer.byteLength(text, 'utf-8') / 4)
    }
  }

  async countMessages(messages: Message[]): Promise<number> {
    let total = 0
    for (const msg of messages) {
      // Add some fixed costs (such as anthropic effects, roughly estimated) based on the role.
      total += 3
      if (msg.role === 'system') total += 1
      // Mainly calculates content text
      total += await this.countText(msg.content)
      // If there are tool calls, calculate the parameter text as well.
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += await this.countText(JSON.stringify(tc.arguments))
          total += await this.countText(tc.name)
        }
      }
      // For contentBlocks, simplify: process only the text type within them.
      if (msg.contentBlocks) {
        for (const block of msg.contentBlocks) {
          if (block.type === 'text' && block.text) {
            total += await this.countText(block.text)
          } else if (block.type === 'tool_use' && block.input) {
            total += await this.countText(JSON.stringify(block.input))
          } else if (block.type === 'tool_result' && block.content) {
            total += await this.countText(block.content)
          }
        }
      }
    }
    return total
  }
}

