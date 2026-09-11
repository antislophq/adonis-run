
import { appendFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { IgnitorFactory } from '@adonisjs/core/factories'

const appRoot = pathToFileURL(`${process.argv[2]}/`)
const argv = process.argv.slice(3)
const record = (event) => appendFileSync(new URL('events.jsonl', appRoot), `${JSON.stringify(event)}\n`)

class FixtureProvider {
  constructor(app) {
    this.app = app
  }

  register() {
    record('register')
    this.app.container.singleton('fixture.service', () => ({ booted: false, ready: false }))
  }

  async boot() {
    await setTimeout(10)
    const service = await this.app.container.make('fixture.service')
    service.booted = true
    record('boot')
  }

  async ready() {
    await setTimeout(10)
    const service = await this.app.container.make('fixture.service')
    service.ready = true
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
