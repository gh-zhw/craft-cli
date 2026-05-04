// src/ui/chalk-ui.ts
import chalk from 'chalk'
import boxen from 'boxen'
import ora, { Ora } from 'ora'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'


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
      spinner.fail(finalText ? chalk.red(finalText) : undefined)
    } else {
      spinner.succeed(finalText ? chalk.gray(finalText) : undefined)
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
    spinner.text = chalk.yellow('Waiting for confirmation...')
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

const userLine = chalk.hex('#F97316')('━'.repeat(80))

/**
 * Print a separator and a bold "You:" label to mark the start of a user message block.
 */
export function printUserMessageStart() {
  console.log(userLine)
  console.log(chalk.bold.hex('#F97316')('You:'))
  console.log(userLine)
}

/**
 * Print the closing separator line after a user message block.
 */
export function printUserMessageEnd() {
  console.log(userLine)
}

const assistantLine = chalk.hex('#3B82FF')('━'.repeat(80))

/**
 * Print a visually distinct separator line and a bold "Assistant:" label
 * to indicate the start of an assistant's response block.
 */
export function printAssistantReplyStart() {
  console.log(assistantLine)
  console.log(chalk.bold.blue('Assistant:'))
  console.log(assistantLine)
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
  console.log(chalk.green('>'), text);
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
export function printAssistantHeader() {
  const text =
    chalk.bold.blue('Craft CLI') + ' - ' + chalk.dim('Hand-crafted agent in your terminal')
  console.log(boxen(text, { padding: 1, borderColor: 'blue', borderStyle: 'round' }))
}

/**
 * Show a tool call indicator with a spinner.
 *
 * @param name - Name of the tool being called.
 * @param args - Arguments passed to the tool (will be previewed).
 */
export function printToolCallStart(name: string, args: any) {
  const argsPreview = JSON.stringify(args).substring(0, 80)
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
  const argsPreview = JSON.stringify(args).substring(0, 80)
  const text = `Calling tool: ${name} ${argsPreview}`
  if (spinner) {
    if (error) {
      stopSpinner(chalk.red(text), { type: 'fail' })
    } else {
      stopSpinner(chalk.gray(text))
    }
  } else {
    console.log(text)
  }
}

/**
 * Display token consumption statistics right-aligned under the response area.
 * Typically printed after the assistant's final response.
 *
 * @param tokensUsed - Number of tokens used in the response.
 */
export function printStatus(tokensUsed: number) {
  const tokenText = chalk.dim(`Tokens: ${tokensUsed} (${(tokensUsed / 1000).toFixed(1)}k)`)
  console.log(' '.repeat(80 - tokenText.length) + tokenText)
}

