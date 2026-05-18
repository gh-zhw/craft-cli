// src/tools/get-current-time.ts
import { z } from 'zod'
import type { Tool } from '../types.js'

const paramsSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone name, e.g. "Asia/Shanghai". Defaults to system local time.'),
})

export const getCurrentTimeTool: Tool<z.input<typeof paramsSchema>> = {
  name: 'get_current_time',
  description:
    'Get the current date and time. Returns ISO 8601 formatted time with timezone offset. ' +
    'Use this tool when you need to know the exact current time, for example when working with file timestamps, date calculations, or time-sensitive reasoning.',
  parameters: paramsSchema,
  async execute(args) {
    const now = new Date()

    let isoString: string
    let friendlyDate: string
    let tzLabel: string

    if (args.timezone) {
      try {
        // Validate timezone
        const testFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: args.timezone,
        })
        testFormatter.format(now) // will throw if invalid

        // Build ISO 8601 string with offset
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: args.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
          hour12: false,
        }).formatToParts(now)

        const pad = (s: string) => s.padStart(2, '0')
        const dateParts: Record<string, string> = {}
        for (const p of parts) {
          if (p.type !== 'literal') dateParts[p.type] = p.value
        }
        const dateStr = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
        const timeStr = `${pad(dateParts.hour)}:${pad(dateParts.minute)}:${pad(dateParts.second)}.${dateParts.fractionalSecond}`
        const isoBase = `${dateStr}T${timeStr}`

        // Get offset
        const offsetPart = new Intl.DateTimeFormat('en-US', {
          timeZone: args.timezone,
          timeZoneName: 'longOffset',
        }).formatToParts(now).find(p => p.type === 'timeZoneName')
        const offset = offsetPart?.value ?? 'Z'
        isoString = isoBase + offset.replace('GMT', '') // "UTC+8" -> "+8"

        // Friendly date
        friendlyDate = new Intl.DateTimeFormat('en-US', {
          timeZone: args.timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(now)

        tzLabel = `${args.timezone} (${offset})`
      } catch {
        return `Error: Invalid timezone: ${args.timezone}`
      }
    } else {
      // System local time
      // Build ISO 8601 with local offset
      const localFormatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false,
      })
      const parts = localFormatter.formatToParts(now)
      const pad = (s: string) => s.padStart(2, '0')
      const dateParts: Record<string, string> = {}
      for (const p of parts) {
        if (p.type !== 'literal') dateParts[p.type] = p.value
      }
      const dateStr = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
      const timeStr = `${pad(dateParts.hour)}:${pad(dateParts.minute)}:${pad(dateParts.second)}.${dateParts.fractionalSecond}`

      // Local offset
      const offsetMinutes = -now.getTimezoneOffset()
      const sign = offsetMinutes >= 0 ? '+' : '-'
      const absMin = Math.abs(offsetMinutes)
      const offH = pad(String(Math.floor(absMin / 60)))
      const offM = pad(String(absMin % 60))
      const offset = sign + offH + ':' + offM

      isoString = `${dateStr}T${timeStr}${offset}`

      friendlyDate = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(now)

      tzLabel = `Local (UTC${offset})`
    }

    return `Current time: ${isoString} (${tzLabel})\n${friendlyDate}`
  },
}