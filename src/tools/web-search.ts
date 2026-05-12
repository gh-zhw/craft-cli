// src/tools/web-search.ts
import { z } from 'zod'
import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().min(1).max(20).optional().default(10).describe('Max results (default 10, max 20)'),
})

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`

  const response = await axios.get<string>(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
    },
    timeout: 10000,
    responseType: 'text',
  })

  const $ = cheerio.load(response.data)
  const results: SearchResult[] = []

  if ($('#b_results .b_no').length > 0) {
    return results
  }

  $('#b_results .b_algo').each((_, el) => {
    if (results.length >= maxResults) return false

    const titleEl = $(el).find('h2 a')
    const snippetEl = $(el).find('.b_caption p')

    const title = titleEl.text().trim()
    const url = titleEl.attr('href') || ''
    const snippet = snippetEl.text().trim()

    if (title && url) {
      results.push({ title, url, snippet })
    }
  })

  return results
}

export const webSearchTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'web_search',
  description: 'Search the web using Bing. Returns titles, URLs, and snippets.',
  parameters: paramsSchema,
  async execute(args) {
    try {
      const results = await searchBing(args.query, args.limit!)
      if (results.length === 0) {
        return `No results found for "${args.query}".`
      }
      let output = `# Search Results for "${args.query}"\n**Found ${results.length} results**\n\n`
      results.forEach((r, i) => {
        output += `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}\n\n`
      })
      return output.trim()
    } catch (error: any) {
      return `Search failed: ${error.message}`
    }
  },
}