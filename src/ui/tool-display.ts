// src/ui/tool-display.ts
import chalk from 'chalk'


/**
 * Format a human-readable display string for a tool call.
 * Returns a single-line summary suitable for the approval panel.
 */
export function formatToolDisplay(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    case 'write_file': {
      const path = args.path as string
      const content = args.content as string
      const preview = content.length > 200
        ? content.slice(0, 200) + '...'
        : content
      const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
      return `Write ${chalk.cyan(path)} (${sizeKB} KB)\n${chalk.dim(preview)}`
    }
    case 'edit_file': {
      const path = args.path as string
      const oldStr = args.old_string as string
      const newStr = args.new_string as string
      const diffPreview = `${chalk.red(oldStr.slice(0, 40))} → ${chalk.green(newStr.slice(0, 40))}`
      return `Edit ${chalk.cyan(path)}\n${diffPreview}`
    }

    case 'run_shell': {
      const command = args.command as string
      return `Run: ${chalk.yellow(command)}`
    }

    case 'web_fetch': {
      const url = args.url as string
      return `Fetch: ${chalk.blue(url)}`
    }

    case 'web_search': {
      const query = args.query as string
      return `Search: "${chalk.bold(query)}"`
    }

    case 'read_file': {
      const path = args.path as string
      return `Read ${chalk.cyan(path)}`
    }

    case 'grep': {
      const pattern = args.pattern as string
      const include = args.include as string | undefined
      return `Grep "${chalk.bold(pattern)}"${include ? ' in ' + include : ''}`
    }

    case 'glob': {
      const pattern = args.pattern as string
      return `Glob "${chalk.bold(pattern)}"`
    }

    case 'add_memory': {
      const content = args.content as string
      return `Remember: "${chalk.italic(content.slice(0, 80))}"`
    }

    default:
      return `${toolName} ${JSON.stringify(args).slice(0, 100)}`
  }
}
