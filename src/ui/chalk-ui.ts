// src/ui/chalk-ui.ts
import chalk from 'chalk'
import boxen from 'boxen'
import ora, { Ora } from 'ora'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { SessionInfoProps } from '../types'


const dialogBoxWidth = process.stdout.columns


// Configure marked to render for terminal
marked.setOptions({
  renderer: new TerminalRenderer({
    emoji: true,
    codespan: chalk.cyan,
    link: chalk.blue.underline,
    blockquote: chalk.gray,
  }),
})

let spinner: Ora | null = null

/**
 * Start a new spinner, stopping any existing one first.
 */
export function startSpinner(text: string): Ora {
  if (spinner) spinner.stop()
  spinner = ora({ text, spinner: 'dots' }).start()
  return spinner
}

/**
 * Stop the spinner permanently, with optional final message.
 * @param finalText Text to display after stopping.
 * @param options.type 'success' | 'fail' – determines icon and color.
 */
export function stopSpinner(
  finalText?: string,
  options?: { type?: 'success' | 'fail' }
) {
  if (!spinner) return
  const { type = 'success' } = options || {}

  if (spinner.isSpinning) {
    // Spinner is active – use ora's native methods
    if (type === 'fail') {
      spinner.fail(finalText ? finalText : undefined)
    } else {
      spinner.succeed(finalText ? finalText : undefined)
    }
  } else {
    // Spinner was paused (stopped manually). Print manually with icon.
    const icon = type === 'fail' ? chalk.red('✖') : chalk.gray('✔')
    if (finalText) {
      console.log(`${icon} ${finalText}`)
    } else {
      console.log(icon)
    }
  }
  spinner = null
}

/**
 * Pause the spinner
 */
export function pauseSpinner() {
  if (spinner) {
    spinner.stop()
  }
}

/**
 * Resume the spinner after being paused.
 */
export function resumeSpinner() {
  if (spinner) {
    spinner.start()
  }
}

/**
 * Stream a text chunk directly to stdout (no newline).
 */
export function printStreamingText(chunk: string) {
  process.stdout.write(chunk)
}

/**
 * Print a newline after streaming is done.
 */
export function finishStream() {
  process.stdout.write('\n')
}

const userLine = chalk.hex('#ee7b29')('─'.repeat(dialogBoxWidth))

/**
 * Print a separator and a bold "You:" label to mark the start of a user message block.
 */
export function printUserMessageStart() {
  console.log(chalk.bold.hex('#ee7b29')('You:'))
}

/**
 * Print the closing separator line after a user message block.
 */
export function printUserMessageEnd() {
  console.log(userLine)
}

const assistantLine = chalk.hex('#3171df')('─'.repeat(dialogBoxWidth))

/**
 * Print a visually distinct separator line and a bold "Assistant:" label
 * to indicate the start of an assistant's response block.
 */
export function printAssistantReplyStart() {
  console.log(chalk.bold.hex('#3171df')('Craft:'))
}

/**
 * Print the closing separator line at the end of an assistant's response.
 */
export function printAssistantReplyEnd() {
  console.log(assistantLine)
}

/**
 * Display a user message with a green prompt indicator.
 */
export function printUserMessage(text: string) {
  console.log(chalk.green('>'), text)
}

/**
 * Render a Markdown string to terminal.
 */
export function printMarkdown(text: string) {
  process.stdout.write(marked.parse(text, { async: false }) as string)
}

/**
 * Print the craft-cli header/logo at startup.
 */
const logo = `
   ██████╗ ██████╗  █████╗ ███████╗████████╗     ██████╗██╗     ██╗
  ██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝    ██╔════╝██║     ██║
  ██║     ██████╔╝███████║█████╗     ██║       ██║     ██║     ██║
  ██║     ██╔══██╗██╔══██║██╔══╝     ██║       ██║     ██║     ██║
  ╚██████╗██║  ██║██║  ██║██║        ██║       ╚██████╗███████╗██║
   ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝        ╚═════╝╚══════╝╚═╝`
export function printAssistantHeader() {
  const text = chalk.hex('#b11f1f')(logo)
  console.log(boxen(text, { padding: 1, borderColor: '#c51818', borderStyle: 'round' }))
}

/**
 * Show a tool call indicator with a spinner.
 *
 * @param name - Name of the tool being called.
 * @param args - Arguments passed to the tool (will be previewed).
 */
export function printToolCallStart(name: string, args: any) {
  const argsStr = JSON.stringify(args)
  let argsPreview = argsStr
  if (argsStr.length > 50) {
    argsPreview = argsStr.slice(0, 50) + '...'
  }
  startSpinner(chalk.yellow(`Calling tool: ${name} ${argsPreview}`))
}

/**
 * Update the tool call spinner text when done.
 *
 * @param name - Name of the tool that finished.
 * @param args - Arguments of the tool call.
 * @param error - Whether the tool execution failed (default false).
 */
export function printToolCallEnd(name: string, args: any, error?: boolean) {
  const argsStr = JSON.stringify(args)
  let argsPreview = argsStr
  if (argsStr.length > 50) {
    argsPreview = argsStr.slice(0, 50) + '...'
  }
  const text = `Tool called: ${name} ${argsPreview}`
  if (spinner) {
    if (error) {
      stopSpinner(chalk.red(text), { type: 'fail' })
    } else {
      stopSpinner(chalk.dim(text))
    }
  } else {
    console.log(text)
  }
}

/**
 * Display token consumption with a percentage bar and colour-coded warnings.
 *
 * @param tokensUsed - Total tokens used in the current conversation.
 * @param contextLimit - Maximum context window of the model.
 * @param model - Current model identifier (e.g. "deepseek-v4-flash").
 */
export function printStatus(tokensUsed: number, contextLimit: number, model?: string) {
  const pct = (tokensUsed / contextLimit) * 100
  const usedStr = `${tokensUsed} (${(tokensUsed / 1000).toFixed(1)}k)`
  const limitStr = `${contextLimit} (${(contextLimit / 1000).toFixed(0)}k)`
  const pctStr = `${pct.toFixed(1)}%`

  let statusText: string
  let colorStatusText: string
  if (pct >= 95) {
    statusText = `Tokens: ${usedStr} / ${limitStr} (${pctStr})`
    colorStatusText = chalk.red(statusText)
  } else if (pct >= 80) {
    statusText = `Tokens: ${usedStr} / ${limitStr} (${pctStr})`
    colorStatusText = chalk.yellow(statusText)
  } else {
    statusText = `Tokens: ${usedStr} / ${limitStr} (${pctStr})`
    colorStatusText = chalk.dim(statusText)
  }

  const modelStr = model ? model : ''
  const colorModelStr = chalk.dim(model)

  const padding = Math.max(1, dialogBoxWidth - modelStr.length - statusText.length)
  console.log(colorModelStr + ' '.repeat(padding) + colorStatusText)
}

/**
 * Display a formatted session information panel.
 */
export function printSessionInfo(props: SessionInfoProps) {
  const lines: string[] = []
  const percent = ((props.tokensUsed / props.contextLimit) * 100).toFixed(1)
  lines.push(chalk.bold.blue('Session Info'))
  lines.push(chalk.dim('─────────────────────────'))
  lines.push(`Model        : ${chalk.cyan(props.model)}`)
  lines.push(`Workspace    : ${chalk.gray(props.workspace)}`)
  lines.push(`Tokens       : ${props.tokensUsed} / ${props.contextLimit} (${percent}%)`)
  lines.push(`Messages     : ${props.messagesCount}`)
  lines.push(`Tools loaded : ${props.toolsCount}`)
  lines.push(`Memories     : ${props.hasMemories ? chalk.green('present') : chalk.gray('none')}`)
  lines.push(
    `Auto approve : ${props.autoApprove ? chalk.yellow('ON') : chalk.gray('off')}`
  )
  console.log(boxen(lines.join('\n'), {
    padding: 1,
    borderColor: 'cyan',
    borderStyle: 'round',
  }))
}
