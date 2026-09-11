import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Kernel } from '@adonisjs/core/ace'
import Configure from '@adonisjs/core/commands/configure'
import { AppFactory } from '@adonisjs/core/factories/app'
import { configure } from '@antislop/adonis-run'
import { createFixture } from './helpers/fixture.js'

test('configure adds the command loader alongside existing commands', async (t) => {
  const fixture = await createFixture(t, {
    'adonisrc.ts': `import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  commands: [() => import('@adonisjs/core/commands')],
})
`,
    'tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext' },
      include: ['adonisrc.ts'],
    }),
  })
  const appRoot = pathToFileURL(`${fixture.appRoot}/`)
  const app = new AppFactory().create(appRoot)
  app.rcContents({})
  await app.init()
  try {
    const kernel = new Kernel(app)
    kernel.ui.switchMode('raw')
    const command = await kernel.create(Configure, ['@antislop/adonis-run'])
    await configure(command)
  } finally {
    await app.terminate()
  }

  const rc = await readFile(new URL('adonisrc.ts', appRoot), 'utf8')
  assert.match(rc, /import\(['"]@antislop\/adonis-run\/commands['"]\)/)
  assert.match(rc, /import\(['"]@adonisjs\/core\/commands['"]\)/)
})
