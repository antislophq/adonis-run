import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { IgnitorFactory } from '@adonisjs/core/factories'

const appRoot = pathToFileURL(`${process.argv[2]}/`)
const argv = process.argv.slice(3)
const record = (event) => appendFileSync(new URL('events.jsonl', appRoot), `${JSON.stringify(event)}\n`)

class FixtureProvider {
  register() {
    record('register')
  }

  boot() {
    record('boot')
  }

  ready() {
    record('ready')
  }

  shutdown() {
    record('shutdown')
  }
}

const ignitor = new IgnitorFactory()
  .withCoreProviders()
  .withCoreConfig()
  .merge({
    config: { fixture: { message: 'configuration is available' } },
    rcFileContents: {
      commands: [() => import('@antislop/adonis-run/commands')],
      providers: [async () => ({ default: FixtureProvider })],
      preloads: [() => import(new URL('preload.js', appRoot).href)],
    },
  })
  .create(appRoot)

try {
  await ignitor.ace().handle(argv)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
