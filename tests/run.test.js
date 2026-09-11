import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { captureScript, createFixture } from './helpers/fixture.js'

const completedLifecycle = ['register', 'boot', 'preload', 'ready', 'script:start', 'script:end', 'shutdown']

function assertSuccess(result) {
  assert.equal(result.status, 0, result.output)
  assert.ok(result.result, `Script did not produce a result:\n${result.output}`)
  assert.deepEqual(result.events, completedLifecycle)
}

function assertFailure(result) {
  assert.equal(typeof result.status, 'number', result.output)
  assert.notEqual(result.status, 0, result.output)
  assert.equal(result.result, undefined, result.output)
  assert.ok(!result.events.includes('script:end'), result.output)
}

test('boots providers, preloads and services before importing, awaits the script, then shuts down', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run', 'scripts/capture.js'])
  assertSuccess(result)
  assert.equal(result.result.ready, true)
  assert.equal(result.result.environment, 'console')
  assert.equal(result.result.config, 'configuration is available')
  assert.equal(result.result.loggerAvailable, true)
  assert.deepEqual(result.result.service, { booted: true, ready: true, preloaded: true })
  assert.deepEqual(result.result.argv, [process.execPath, path.join(fixture.appRoot, 'scripts/capture.js')])
})

test('resolves scripts relative to the application, not cwd, and decodes spaces in argv[1]', async (t) => {
  const name = 'scripts/nested folder/report with spaces.js'
  const fixture = await createFixture(t, { [name]: captureScript })
  const result = await fixture.run(['run', `./${name}`])
  assertSuccess(result)
  assert.equal(result.result.cwd, fixture.cwd)
  assert.equal(result.result.argv[1], path.join(fixture.appRoot, name))
  assert.equal(result.result.url, pathToFileURL(path.join(fixture.appRoot, name)).href)
  assert.ok(!result.result.argv[1].includes('%20'))
})

test('runs TypeScript with app import aliases using the Adonis TS loader', async (t) => {
  const name = 'scripts/typed report.ts'
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
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        rewriteRelativeImportExtensions: true,
      },
    }),
    'app/services/greeting.ts': `
import type { Config } from '@adonisjs/core/config'

export default class Greeting {
  constructor(private config: Config) {}

  message(): string {
    return this.config.get<string>('fixture.message')
  }
}
`,
    [name]: `
import { appendFileSync, writeFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import app from '@adonisjs/core/services/app'
import Greeting from '#services/greeting'

const record = (event: string): void => {
  appendFileSync(app.makeURL('events.jsonl'), JSON.stringify(event) + '\\n')
}
record('script:start')
const greeting: Greeting = new Greeting(await app.container.make('config'))
await setTimeout(25)
writeFileSync(app.makeURL('result.json'), JSON.stringify({
  message: greeting.message(),
  ready: app.isReady,
  argv: process.argv,
  cwd: process.cwd(),
  url: import.meta.url,
}))
record('script:end')
`,
  })
  const args = ['007', '--dry-run', 'two words']
  const result = await fixture.run(['run', name, '--', ...args], {
    nodeArgs: ['--import=@poppinss/ts-exec'],
  })
  assertSuccess(result)
  assert.equal(result.result.message, 'configuration is available')
  assert.equal(result.result.ready, true)
  assert.equal(result.result.cwd, fixture.cwd)
  assert.equal(result.result.url, pathToFileURL(path.join(fixture.appRoot, name)).href)
  assert.deepEqual(result.result.argv, [process.execPath, path.join(fixture.appRoot, name), ...args])
})

test('preserves positional arguments, numeric strings, empty strings and shell metacharacters', async (t) => {
  const fixture = await createFixture(t)
  const args = ['first', 'two words', '00123', '42', '3.140', '1e3', 'true', '', '雪', '$HOME; echo nope', 'last']
  const result = await fixture.run(['run', 'scripts/capture.js', ...args])
  assertSuccess(result)
  assert.deepEqual(result.result.argv, [process.execPath, path.join(fixture.appRoot, 'scripts/capture.js'), ...args])
})

test('forwards flags after -- verbatim, including Ace flags, numeric strings and another --', async (t) => {
  const fixture = await createFixture(t)
  const args = ['before', '007', '--dry-run', '--count=001', '-n', '-12', '00123', '3.140', '--help', '--no-ansi', '', '--', 'after']
  const result = await fixture.run(['run', 'scripts/capture.js', ...args.slice(0, 2), '--', ...args.slice(2)])
  assertSuccess(result)
  assert.deepEqual(result.result.argv.slice(2), args)
})

test('accepts a trailing -- without adding it to script arguments', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run', 'scripts/capture.js', '--'])
  assertSuccess(result)
  assert.deepEqual(result.result.argv.slice(2), [])
})

for (const flag of ['--dry-run', '-z']) {
  test(`rejects unknown flag ${flag} before -- without importing the script`, async (t) => {
    const fixture = await createFixture(t)
    const result = await fixture.run(['run', 'scripts/capture.js', flag])
    assertFailure(result)
    assert.match(result.output, /unknown|undefined|not defined|unexpected/i)
    assert.ok(result.output.includes(flag.replace(/^-+/, '')), result.output)
    assert.ok(!result.events.includes('script:start'))
  })
}

test('requires a file argument', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run'])
  assertFailure(result)
  assert.match(result.output, /file/i)
  assert.match(result.output, /missing|required/i)
  assert.ok(!result.events.includes('script:start'))
})

test('shows run help through the package command loader without executing a script', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run', '--help'])
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /Run a script file with the application booted/)
  assert.match(result.output, /--dry-run/)
  assert.equal(result.result, undefined)
  assert.ok(!result.events.includes('script:start'))
})

test('reports a missing app-relative file and exits nonzero', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run', 'scripts/missing file.js'])
  assertFailure(result)
  assert.match(result.output, /Script file not found: scripts\/missing file\.js/)
  assert.deepEqual(result.events, ['register', 'boot', 'preload', 'ready', 'shutdown'])
})

for (const [name, source, message] of [
  ['synchronous throw', "throw new Error('fixture synchronous failure')", /fixture synchronous failure/],
  ['top-level await rejection', "await Promise.reject(new Error('fixture asynchronous failure'))", /fixture asynchronous failure/],
  ['failed dependency import', "import './missing-dependency.js'", /missing-dependency/],
  ['syntax error', 'export const = invalid', /SyntaxError|Unexpected token/],
]) {
  test(`${name} in the script exits nonzero rather than succeeding`, async (t) => {
    const fixture = await createFixture(t, { 'scripts/failure.js': source })
    const result = await fixture.run(['run', 'scripts/failure.js'])
    assertFailure(result)
    assert.match(result.output, message)
    assert.ok(!result.output.includes('Script file not found:'), result.output)
    assert.deepEqual(result.events, ['register', 'boot', 'preload', 'ready', 'shutdown'])
  })
}

test('propagates non-ENOENT access errors instead of reporting a missing script', async (t) => {
  const fixture = await createFixture(t)
  // A regular file used as a parent produces ENOTDIR without relying on chmod
  // permissions, which can behave differently when tests run as root.
  const result = await fixture.run(['run', 'scripts/capture.js/child.js'])
  assertFailure(result)
  assert.match(result.output, /ENOTDIR|not a directory/i)
  assert.ok(!result.output.includes('Script file not found:'), result.output)
  assert.deepEqual(result.events, ['register', 'boot', 'preload', 'ready', 'shutdown'])
})

test('does not misreport a directory import as a missing script', async (t) => {
  const fixture = await createFixture(t)
  const result = await fixture.run(['run', 'scripts'])
  assertFailure(result)
  assert.match(result.output, /directory\s+import|ERR_UNSUPPORTED_DIR_IMPORT/i)
  assert.ok(!result.output.includes('Script file not found:'), result.output)
})
