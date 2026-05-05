// src/ui/approval.ts
import readline from 'node:readline'
import chalk from 'chalk'
import { pauseSpinner, resumeSpinner, stopSpinner } from './chalk-ui.js'

/**
 * Creates an approval function that prompts the user with the given readline interface.
 */
export function createAskApproval(rl: readline.Interface): (message: string) => Promise<boolean> {
  return async (message: string): Promise<boolean> => {
    // Pause any running spinner so it doesn't conflict with the prompt
    pauseSpinner()

    return new Promise<boolean>((resolve) => {
      rl.question(chalk.yellow('▶ ') + chalk.gray(message) + chalk.dim(' (y/n) '), (answer) => {
        const normalized = answer.trim().toLowerCase()
        const approved = normalized === 'y' || normalized === 'yes'

        if (approved) {
          // Resume the spinner so tool execution can continue
          resumeSpinner()
        }

        resolve(approved)
      })
    })
  }
}