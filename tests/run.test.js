import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { captureScript, createFixture } from './helpers/fixture.js'

test('runs an app-relative script after boot and waits for it before shutdown', async (t) => {
  const name = 'scripts/report with spaces.js'
  const fixture = await createFixture(t, { [name]: captureScript })
  const result = await fixture.run(['run', name])

  assert.equal(result.status, 0, result.output)
  assert.deepEqual(result.events, ['register', 'boot', 'preload', 'ready', 'script:start', 'script:end', 'shutdown'])
  assert.equal(result.result.ready, true)
  assert.equal(result.result.config, 'configuration is available')
  assert.deepEqual(result.result.argv, [process.execPath, path.join(fixture.appRoot, name)])
})

test('runs TypeScript with application import aliases', async (t) => {
  const fixture = await createFixture(t, {
    'package.json': JSON.stringify({
      type: 'module',
      imports: { '#services/*': './app/services/*.js' },
    }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        rewriteRelativeImportExtensions: true,
      },
    }),
    'app/services/greeting.ts': `
import config from '@adonisjs/core/services/config'

export function greeting(): string {
  return config.get<string>('fixture.message')
}
`,
    'scripts/greet.ts': `
import { writeFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import { greeting } from '#services/greeting'

const message: string = greeting()
writeFileSync(app.makeURL('result.json'), JSON.stringify({ message }))
`,
  })
  const result = await fixture.run(['run', 'scripts/greet.ts'], {
    nodeArgs: ['--import=@poppinss/ts-exec'],
  })

  assert.equal(result.status, 0, result.output)
  assert.equal(result.result.message, 'configuration is available')
})

test('forwards positional arguments and flags after -- without changing them', async (t) => {
  const fixture = await createFixture(t)
  const positional = ['production', '007', 'two words']
  const flags = ['--dry-run', '--limit=010', '--help', '--', 'after']
  const result = await fixture.run(['run', 'scripts/capture.js', ...positional, '--', ...flags])

  assert.equal(result.status, 0, result.output)
  assert.deepEqual(result.result.argv.slice(2), [...positional, ...flags])
})

test('reports a missing script and exits nonzero', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run', 'scripts/missing.js'])

  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /Script file not found: scripts\/missing\.js/)
})

test('reports script errors, exits nonzero, and shuts down the app', async (t) => {
  const fixture = await createFixture(t, {
    'scripts/failure.js': "await Promise.reject(new Error('release failed'))",
  })
  const result = await fixture.run(['run', 'scripts/failure.js'])

  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /release failed/)
  assert.equal(result.events.at(-1), 'shutdown')
})
