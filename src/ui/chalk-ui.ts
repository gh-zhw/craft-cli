// src/ui/chalk-ui.ts
import chalk from 'chalk'
import boxen from 'boxen'
import ora, { Ora } from 'ora'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import { SessionInfoProps } from '../types'
import { formatToolDisplay } from './tool-display'


function getDialogBoxWidth(): number {
  return process.stdout.columns ?? 80
}


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

/**
 * Print a separator and a bold "You" label to mark the start of a user message block.
 */
export function printUserMessageStart() {
  console.log(chalk.bold.hex('#ee7b29')(`• You`))
}

/**
 * Print the closing separator line after a user message block.
 */
export function printUserMessageEnd() {
  const now = new Date()
  const time = `[${now.toTimeString().slice(0, 8)}]`
  const totalWidth = getDialogBoxWidth()
  const leftDashCount = Math.floor(totalWidth * 0.9)
  const rightDashCount = totalWidth - leftDashCount - time.length
  const line = '='.repeat(leftDashCount) + time + '='.repeat(Math.max(0, rightDashCount))
  console.log(chalk.hex('#ee7b29')(line))
}

/**
 * Print a visually distinct separator line and a bold "Craft" label
 * to indicate the start of an assistant's response block.
 */
export function printAssistantReplyStart() {
  console.log(chalk.bold.hex('#3171df')(`• Craft`))
}

/**
 * Print the closing separator line at the end of an assistant's response.
 */
export function printAssistantReplyEnd() {
  const now = new Date()
  const time = `[${now.toTimeString().slice(0, 8)}]`
  const totalWidth = getDialogBoxWidth()
  const leftDashCount = Math.floor(totalWidth * 0.9)
  const rightDashCount = totalWidth - leftDashCount - time.length
  const line = '='.repeat(leftDashCount) + time + '='.repeat(Math.max(0, rightDashCount))
  console.log(chalk.hex('#3171df')(line))
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
    ██████╗ ██████╗  █████╗ ███████╗████████╗
    ██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝
██║     ██████╔╝███████║█████╗     ██║
██║     ██╔══██╗██╔══██║██╔══╝     ██║
╚██████╗██║  ██║██║  ██║██║        ██║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝`
export function printAssistantHeader(version: string, workspaceRoot?: string) {
  const text = chalk.hex('#ee2a2a')(logo)
  const commandsTips =
    chalk.cyan('/exit') + chalk.dim(' quit · ') +
    chalk.cyan('/reset') + chalk.dim(' reset · ') +
    chalk.cyan('/info') + chalk.dim(' status\n') +
    chalk.cyan('/auto') + chalk.dim(' toggle approval mode · ') +
    chalk.cyan('/remember') + chalk.dim(' save memory\n') +
    chalk.cyan('/task') + chalk.dim(' structured task · ') +
    chalk.cyan('/compact') + chalk.dim(' compact context')
  let content = text + '\n\n' + commandsTips
  if (workspaceRoot && workspaceRoot?.length > 0) {
    content += '\n\n' + chalk.gray(`Workspace: ${workspaceRoot}`)
  }

  console.log(boxen(content, {
    textAlignment: 'center',
    borderColor: '#ee2a2a',
    borderStyle: 'bold',
    title: version,
    titleAlignment: 'left',
    padding: 0.5,
    margin: 0,
  }))
}

/**
 * Show a tool call indicator with a spinner.
 *
 * @param name - Name of the tool being called.
 * @param args - Arguments passed to the tool (will be previewed).
 */
export function printToolCallStart(name: string, args: Record<string, any>) {
  const toolDesc = formatToolDisplay(name, args)
  const shortDesc = toolDesc.split(/\r?\n/)[0]
  startSpinner(chalk.yellow(shortDesc))
}

/**
 * Update the tool call spinner text when done.
 *
 * @param name - Name of the tool that finished.
 * @param result - Result of the tool call.
 * @param error - Whether the tool execution failed (default false).
 */
export function printToolCallEnd(name: string, result: string, error?: boolean) {
  const shortRes = result.split(/\r?\n/)[0]
  const toolDesc = `Tool ${name}: ${shortRes}`

  if (spinner) {
    if (error) {
      stopSpinner(chalk.red(toolDesc), { type: 'fail' })
    } else {
      stopSpinner(chalk.dim(toolDesc))
    }
  } else {
    console.log(toolDesc)
  }
}

/**
 * Display token consumption with a percentage bar and colour-coded warnings.
 *
 * @param contextTokens - Total tokens used in the current conversation (context window usage).
 * @param contextLimit - Maximum context window size of the model.
 * @param apiUsage - Optional breakdown of API token usage; contains `input` and `output` token counts.
 * @param model - Optional current model identifier (e.g. "deepseek-v4-flash").
 */
export function printStatus(
  contextTokens: number,
  contextLimit: number,
  apiUsage?: { input: number; output: number },
  model?: string,
) {
  const pct = (contextTokens / contextLimit) * 100
  const usedStr = `${contextTokens} (${(contextTokens / 1000).toFixed(1)}k)`
  const limitStr = `${contextLimit} (${(contextLimit / 1000).toFixed(0)}k)`
  const pctStr = `${pct.toFixed(1)}%`

  const statusText = `Context window: ${usedStr} / ${limitStr} (${pctStr})`
  let coloredstatusText: string
  if (pct >= 95) {
    coloredstatusText = chalk.red(statusText)
  } else if (pct >= 80) {
    coloredstatusText = chalk.yellow(statusText)
  } else {
    coloredstatusText = chalk.green(statusText)
  }

  let modelTokenText = ''
  let coloredModelTokenText = ''
  if (model) {
    modelTokenText += model
    coloredModelTokenText += chalk.cyan(model)
  }
  if (apiUsage) {
    const usageText = ` ↑${apiUsage.input} ↓${apiUsage.output}`
    modelTokenText += usageText
    coloredModelTokenText += chalk.gray(usageText)
  }

  const padding = Math.max(1, getDialogBoxWidth() - modelTokenText.length - statusText.length)
  console.log(coloredModelTokenText + ' '.repeat(padding) + coloredstatusText)
}

/**
 * Display a formatted session information panel.
 */
export function printSessionInfo(props: SessionInfoProps) {
  const contextPct = (props.currentContext / props.contextLimit) * 100
  const contextPctFixed = contextPct.toFixed(1)

  let contextColor = chalk.green
  if (contextPct >= 90) contextColor = chalk.red
  else if (contextPct >= 70) contextColor = chalk.yellow

  const barLength = 20
  const filled = Math.round((contextPct / 100) * barLength)
  const progressBar = contextColor('█').repeat(filled) + '░'.repeat(barLength - filled)

  const autoApproveStatus = props.autoApprove
    ? chalk.bold.green('ON')
    : chalk.gray('off')

  const maxLabelLen = 13  // "Tokens Usage".length
  const padLabel = (label: string) => label.padEnd(maxLabelLen)

  const lines = [
    `${padLabel('Provider')} : ${chalk.cyan(props.provider)}`,
    `${padLabel('BaseUrl')} : ${chalk.dim(props.baseurl)}`,
    `${padLabel('Model')} : ${chalk.yellow(props.model)}`,
    `${padLabel('Workspace')} : ${chalk.magenta(props.workspace)}`,
    `${padLabel('Context')} : ${chalk.white(props.currentContext)} / ${chalk.white(props.contextLimit)} ${contextColor(`(${contextPctFixed}%)`)} ${progressBar}`,
    `${padLabel('Tokens Usage')} : ↑${chalk.red(props.inputTokensUsed)} / ↓${chalk.green(props.outputTokensUsed)} ${`(total ${props.inputTokensUsed + props.outputTokensUsed})`}`,
    `${padLabel('Messages')} : ${props.messagesCount}`,
    `${padLabel('Tools loaded')} : ${props.toolsCount}`,
    `${padLabel('Auto approve')} : ${autoApproveStatus}`,
  ]

  console.log(boxen(lines.join('\n'), {
    padding: 1,
    borderColor: 'cyan',
    borderStyle: 'round',
    title: 'Session Info',
    titleAlignment: 'center',
  }))
}
