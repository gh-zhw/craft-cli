// src/ui/approval.ts
import readline from 'node:readline'
import chalk from 'chalk'
import { pauseSpinner, resumeSpinner } from './chalk-ui.js'
import type { PermissionLevel } from '../utils/permission.js'

/**
 * Creates an approval function that prompts the user with the given readline interface.
 */
export function createAskApproval(rl: readline.Interface): (message: string, level?: PermissionLevel) => Promise<boolean> {
  return async (message: string, level?: PermissionLevel): Promise<boolean> => {
    // Pause any running spinner so it doesn't conflict with the prompt
    pauseSpinner()

    return new Promise<boolean>((resolve) => {
      let prefix: string

      if (level === 'warn') {
        prefix = chalk.red('! ')
      } else if (level === 'confirm') {
        prefix = chalk.yellow('~ ')
      } else {
        prefix = chalk.gray('~ ')
      }

      rl.question(prefix + chalk.dim(message + ' (y/n) '), (answer) => {
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