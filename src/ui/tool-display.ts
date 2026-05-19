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
      const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
      const lines = content.split('\n')
      const previewLines = lines.slice(0, 8)
      const lineCountStr = lines.length === 1 ? '1 line' : `${lines.length} lines`

      let preview = ''
      previewLines.forEach((line, idx) => {
        const lineNo = idx + 1
        preview += chalk.dim(`${lineNo}  `) + chalk.dim(line) + '\n'
      })
      if (lines.length > previewLines.length) {
        preview += chalk.dim(`... (${lines.length - previewLines.length} more lines)`)
      }
      return `Write ${chalk.cyan(path)} (${sizeKB} KB, ${lineCountStr})\n${preview.trimEnd()}`
    }
    case 'edit_file': {
      const path = args.path as string
      const oldStr = args.old_string as string
      const newStr = args.new_string as string
      const oldLines = oldStr.split('\n')
      const newLines = newStr.split('\n')

      // Build a simple diff view: removed lines in red, added lines in green.
      // We'll show all old lines with '-' and all new lines with '+'.
      let diffPreview = ''
      oldLines.forEach((line) => {
        diffPreview += chalk.red(`- ${line}`) + '\n'
      })
      newLines.forEach((line) => {
        diffPreview += chalk.green(`+ ${line}`) + '\n'
      })

      // Truncate if too long (max 10 total lines displayed)
      const totalLines = oldLines.length + newLines.length
      if (totalLines > 10) {
        const truncatedOld = oldLines.slice(0, 5)
        const truncatedNew = newLines.slice(0, 5)
        diffPreview = ''
        truncatedOld.forEach((line) => {
          diffPreview += chalk.red(`- ${line}`) + '\n'
        })
        diffPreview += chalk.dim('... (truncated)') + '\n'
        truncatedNew.forEach((line) => {
          diffPreview += chalk.green(`+ ${line}`) + '\n'
        })
      }

      return `Edit ${chalk.cyan(path)}\n${diffPreview.trimEnd()}`
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

    case 'task_subagent': {
      const name = args.name as string;
      const task = args.task as string;
      const taskPreview = task.length > 100 ? task.slice(0, 100) + '...' : task;
      return `Sub-agent: ${chalk.cyan(name)}\nTask: ${chalk.dim(taskPreview)}`;
    }

    default:
      return `${toolName} ${JSON.stringify(args).slice(0, 100)}`
  }
}
