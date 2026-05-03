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
 * Stream a text chunk directly to stdout (no newline).
 */
export function printStreamingText(chunk: string) {
  process.stdout.write(chunk);
}

/**
 * Print a newline after streaming is done.
 */
export function finishStream() {
  process.stdout.write('\n');
}

const assistantLine = chalk.hex('#3B82FF')('━'.repeat(40));

/**
 * Print a visually distinct separator line and a bold "Assistant:" label
 * to indicate the start of an assistant's response block.
 */
export function printAssistantReplyStart() {
  console.log(assistantLine);
  console.log(chalk.bold.blue('Assistant:'));
  console.log(assistantLine);
}

/**
 * Print the closing separator line at the end of an assistant's response.
 */
export function printAssistantReplyEnd() {
  console.log(assistantLine);
}

/**
 * Render a Markdown string to terminal.
 */
export function printMarkdown(text: string) {
  process.stdout.write(marked.parse(text, { async: false }) as string);
}

/**
 * Print the craft-cli header/logo at startup.
 */
export function printAssistantHeader() {
  const text =
    chalk.bold.blue('Craft CLI') + ' - ' + chalk.dim('Hand-crafted agent in your terminal');
  console.log(boxen(text, { padding: 1, borderColor: 'blue', borderStyle: 'round' }));
}

/**
 * Show a tool call indicator with a spinner.
 *
 * @param name - Name of the tool being called.
 * @param args - Arguments passed to the tool (will be previewed).
 */
export function printToolCallStart(name: string, args: any) {
  const argsPreview = JSON.stringify(args).substring(0, 80);
  spinner = ora({
    text: chalk.yellow(`Calling tool: ${name} ${argsPreview}`),
    spinner: 'dots',
  }).start();
}

/**
 * Update the tool call spinner text when done.
 *
 * @param name - Name of the tool that finished.
 * @param args - Arguments of the tool call.
 * @param error - Whether the tool execution failed (default false).
 */
export function printToolCallEnd(name: string, args: any, error?: boolean) {
  const argsPreview = JSON.stringify(args).substring(0, 80);
  const text = `Calling tool: ${name} ${argsPreview}`;
  if (spinner) {
    if (error) {
      spinner.fail(chalk.red(text));
    } else {
      spinner.succeed(chalk.gray(text));
    }
    spinner = null;
  } else {
    console.log(text);
  }
}

/**
 * Show a confirmation prompt (auto-approve for now).
 *
 * @param message - The confirmation message to display.
 * @returns Always returns true (auto-approved).
 */
export async function printConfirm(message: string): Promise<boolean> {
  console.log(chalk.yellow('?'), message, chalk.dim('(auto-approved)'));
  return true;
}

/**
 * Display token consumption statistics right-aligned under the response area.
 * Typically printed after the assistant's final response.
 *
 * @param tokensUsed - Number of tokens used in the response.
 */
export function printStatus(tokensUsed: number) {
  const tokenText = chalk.dim(`Tokens: ${tokensUsed} (${(tokensUsed / 1000).toFixed(1)}k)`);
  console.log(' '.repeat(40 - tokenText.length) + tokenText);
}

