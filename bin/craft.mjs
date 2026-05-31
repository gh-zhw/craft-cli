#!/usr/bin/env node
// Use tsx to run the TypeScript entry point
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const entry = join(__dirname, '..', 'src', 'index.ts')

// Call tsx with the entry, forwarding all arguments
const args = process.argv.slice(2)
const child = spawn(process.execPath, ['--import', 'tsx', entry, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
})

child.on('exit', (code) => process.exit(code))
