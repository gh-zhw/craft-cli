// src/ui/approval.ts
import readline from 'node:readline'
import chalk from 'chalk'
import boxen from 'boxen'
import { pauseSpinner, resumeSpinner, stopSpinner } from './chalk-ui.js'
import { formatToolDisplay } from './tool-display.js'
import type { ApprovalRequest, ApprovalAction } from '../types.js'


const APPROVAL_TIMEOUT_MS = 30_000

/**
 * Build a panel content for the approval dialog.
 */
function buildApprovalPanel(request: ApprovalRequest): string {
  const title = request.level === 'warn'
    ? chalk.red('Dangerous Operation')
    : chalk.yellow('Approval Required')

  const toolInfo = formatToolDisplay(request.toolName, request.args)
  const options = [
    chalk.bold.green('[Y]') + ' Allow   ',
    chalk.bold.red('[N]') + ' Deny    ',
    chalk.bold.cyan('[A]') + ' Always    ',
    chalk.bold.gray('[S]') + ' Stop',
  ].join('')

  return boxen(
    `${title}\n\n${toolInfo}\n\n${options}`,
    {
      padding: 1,
      borderColor: request.level === 'warn' ? 'red' : 'yellow',
      borderStyle: 'round',
    }
  )
}

export function createAskApproval(rl: readline.Interface): (request: ApprovalRequest) => Promise<ApprovalAction> {
  return async (request: ApprovalRequest): Promise<ApprovalAction> => {
    // Pause any running spinner and show the approval panel
    pauseSpinner()

    const panel = buildApprovalPanel(request)
    console.log(panel)

    // Reuse readline
    return new Promise<ApprovalAction>((resolve) => {
      let settled = false

      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        console.log(chalk.yellow('\nApproval timed out – automatically denying.'))
        resolve('deny')
      }, APPROVAL_TIMEOUT_MS)

      rl.question('', (answer) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)

        const char = answer.trim().toLowerCase()
        const actionMap: Record<string, ApprovalAction> = {
          y: 'approve',
          n: 'deny',
          a: 'approve_all',
          s: 'stop',
        }
        const action = actionMap[char] || 'deny'  // Default

        resolve(action)

        if (action === 'approve' || action === 'approve_all') {
          resumeSpinner()
        } else {
          stopSpinner(chalk.red(' User denied'), { type: 'fail' })
        }
      })
    })
  }
}