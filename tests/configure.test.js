import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Kernel } from '@adonisjs/core/ace'
import Configure from '@adonisjs/core/commands/configure'
import { AppFactory } from '@adonisjs/core/factories/app'
import { createFixture } from './helpers/fixture.js'
import { configure } from '@antislop/adonis-run/configure'
import { configure as rootConfigure } from '@antislop/adonis-run'

for (const commands of ['', "commands: [() => import('@adonisjs/core/commands')],"]) {
  test(`configure mutates adonisrc.ts idempotently with real codemods (${commands ? 'existing commands' : 'no commands property'})`, async (t) => {
    const original = `import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  // Keep the application's existing settings.
  ${commands}
  providers: [() => import('@adonisjs/core/providers/app_provider')],
  preloads: [() => import('./start/routes.js')],
  directories: { commands: 'custom_commands' },
})
`
    const fixture = await createFixture(t, {
      'adonisrc.ts': original,
      'tsconfig.json': JSON.stringify({
        compilerOptions: { target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext' },
        include: ['adonisrc.ts'],
      }),
    })
    const appRoot = pathToFileURL(`${fixture.appRoot}/`)
    const rcFile = new URL('adonisrc.ts', appRoot)
    const runConfigure = async () => {
      // Fresh command and application instances ensure the second run reads the
      // persisted file, rather than passing through a cached transformer AST.
      const app = new AppFactory().create(appRoot)
      app.rcContents({})
      await app.init()
      try {
        const kernel = new Kernel(app)
        kernel.ui.switchMode('raw')
        const command = await kernel.create(Configure, ['@antislop/adonis-run'])
        await configure(command)
        assert.equal(command.exitCode ?? 0, 0)
      } finally {
        await app.terminate()
      }
    }

    await runConfigure()
    const first = await readFile(rcFile, 'utf8')
    assert.notEqual(first, original)
    assert.match(first, /\(\)\s*=>\s*import\(['"]@antislop\/adonis-run\/commands['"]\)/)
    assert.equal(first.split('@antislop/adonis-run/commands').length - 1, 1)
    assert.ok(first.includes("// Keep the application's existing settings."))
    assert.match(first, /providers:\s*\[\(\)\s*=>\s*import\('@adonisjs\/core\/providers\/app_provider'\)\]/)
    assert.match(first, /preloads:\s*\[\(\)\s*=>\s*import\('\.\/start\/routes\.js'\)\]/)
    assert.match(first, /directories:\s*\{\s*commands:\s*'custom_commands'\s*\}/)
    if (commands) {
      assert.equal(first.split('@adonisjs/core/commands').length - 1, 1)
    }

    await runConfigure()
    assert.equal(await readFile(rcFile, 'utf8'), first)
  })
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('exports the same configure hook from the root and configure entry points', () => {
  assert.equal(rootConfigure, configure)
})

test('awaits codemods creation and rc update, registering the package command loader once', async () => {
  const created = deferred()
  const updating = deferred()
  const finishUpdate = deferred()
  const calls = []
  let finished = false
  const running = configure({
    async createCodemods() {
      calls.push('createCodemods')
      await created.promise
      return {
        async updateRcFile(callback) {
          calls.push('updateRcFile')
          callback({ addCommand: (name) => calls.push(['addCommand', name]) })
          updating.resolve()
          await finishUpdate.promise
        },
      }
    },
  }).then(() => { finished = true })

  assert.deepEqual(calls, ['createCodemods'])
  assert.equal(finished, false)
  created.resolve()
  await updating.promise
  assert.deepEqual(calls, ['createCodemods', 'updateRcFile', ['addCommand', '@antislop/adonis-run/commands']])
  assert.equal(finished, false)
  finishUpdate.resolve()
  await running
  assert.equal(finished, true)
})

test('propagates errors when codemods cannot be created', async () => {
  const error = new Error('codemods unavailable')
  await assert.rejects(configure({ createCodemods: async () => { throw error } }), (actual) => actual === error)
})

test('propagates rc file update errors', async () => {
  const error = new Error('rc update failed')
  await assert.rejects(configure({
    createCodemods: async () => ({ updateRcFile: async () => { throw error } }),
  }), (actual) => actual === error)
})

test('propagates errors from adding the command', async () => {
  const error = new Error('cannot add command')
  await assert.rejects(configure({
    createCodemods: async () => ({
      updateRcFile: async (callback) => callback({ addCommand: () => { throw error } }),
    }),
  }), (actual) => actual === error)
})
