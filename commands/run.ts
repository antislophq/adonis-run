import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { args, BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class Run extends BaseCommand {
  static commandName = 'run'
  static description = 'Run a script file with the application booted'

  static help = [
    'Imports a script after the application has booted, running its top-level code.',
    '{{ binaryName }} run scripts/release.ts',
    '',
    'Additional arguments are available as process.argv.slice(2).',
    '{{ binaryName }} run scripts/release.ts arg1 arg2',
    '',
    'Use -- before script flags to prevent Ace from parsing them.',
    '{{ binaryName }} run scripts/release.ts -- --dry-run',
  ]

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Path to the script, relative to the application root' })
  declare file: string

  @args.spread({ description: 'Arguments to forward to the script', required: false })
  declare scriptArgs?: string[]

  async run() {
    const fileUrl = this.app.makeURL(this.file)

    try {
      await access(fileUrl)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      this.logger.error(`Script file not found: ${this.file}`)
      this.exitCode = 1
      return
    }

    process.argv = [process.argv[0]!, fileURLToPath(fileUrl), ...(this.scriptArgs ?? [])]
    await import(fileUrl.href)
  }
}
