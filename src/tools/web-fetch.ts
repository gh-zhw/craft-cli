// src/tools/web-fetch.ts
import { z } from 'zod'
import axios from 'axios'
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import type { Tool } from '../types.js'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

const paramsSchema = z.object({
  url: z.url().describe('Full URL to fetch (must be HTTP/HTTPS)'),
  maxLength: z.number().min(100).max(50000).optional().default(10000).describe('Max characters to return'),
})

export const webFetchTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'web_fetch',
  description: 'Fetch the content of a web page and convert it to Markdown. Usable to read online documentation, articles, etc.',
  parameters: paramsSchema,
  async execute(args) {
    const url = args.url
    // Validate protocol
    try {
      const urlObj = new URL(url)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return `Error: Only HTTP and HTTPS URLs are allowed.`
      }
      // Block common internal/loopback addresses? Might be overkill.
    } catch {
      return `Error: Invalid URL.`
    }

    try {
      const response = await axios.get<string>(url, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'craft-cli/1.0 (Terminal Agent +https://github.com/gh-zhw/craft-cli)',
        },
        responseType: 'text',
      })

      const html = response.data
      const $ = cheerio.load(html)

      // Remove non-content elements
      $('script, style, nav, footer, iframe, noscript').remove()

      // Prioritize main content area
      let contentElement = $('main').first()
      if (!contentElement.length) contentElement = $('article').first()
      if (!contentElement.length) contentElement = $('body')

      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled'

      // Convert to markdown
      const htmlContent = contentElement.html() || ''
      const markdown = turndown.turndown(htmlContent)
      const trimmed = markdown.length > args.maxLength!
        ? markdown.substring(0, args.maxLength) + '\n\n... (truncated)'
        : markdown

      const wordCount = trimmed.split(/\s+/).length

      return `# ${title}\n**Source:** ${url}\n**Word Count:** ${wordCount}\n\n${trimmed}`
    } catch (error: any) {
      if (error.response?.status) {
        return `Error: HTTP ${error.response.status} - ${error.response.statusText}`
      }
      return `Fetch failed: ${error.message}`
    }
  },
}