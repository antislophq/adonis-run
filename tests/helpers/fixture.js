import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDirectory = fileURLToPath(new URL('../', import.meta.url))
const bootstrap = fileURLToPath(new URL('./ace.js', import.meta.url))

export const captureScript = `
import { appendFileSync, writeFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import app from '@adonisjs/core/services/app'
import config from '@adonisjs/core/services/config'

const record = (event) => appendFileSync(app.makeURL('events.jsonl'), JSON.stringify(event) + '\\n')
record('script:start')
await setTimeout(25)
writeFileSync(app.makeURL('result.json'), JSON.stringify({
  argv: process.argv,
  ready: app.isReady,
  config: config.get('fixture.message'),
}))
record('script:end')
`

export async function createFixture(t, scripts = { 'scripts/capture.js': captureScript }) {
  // Keeping fixtures beneath the project lets ordinary ESM package resolution find
  // the installed Adonis version without symlinks or a second dependency install.
  const root = await mkdtemp(path.join(testsDirectory, '.tmp-run-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const appRoot = path.join(root, 'application with spaces')
  const cwd = path.join(root, 'unrelated working directory')
  await mkdir(appRoot)
  await mkdir(cwd)
  await writeFile(path.join(appRoot, 'package.json'), JSON.stringify({ type: 'module' }))
  await writeFile(path.join(appRoot, 'preload.js'), `
import { appendFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
appendFileSync(app.makeURL('events.jsonl'), JSON.stringify('preload') + '\\n')
`)
  for (const [name, source] of Object.entries(scripts)) {
    const file = path.join(appRoot, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, source)
  }

  return {
    appRoot,
    async run(args, { nodeArgs = [] } = {}) {
      const child = spawn(process.execPath, [...nodeArgs, bootstrap, appRoot, ...args], {
        cwd,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', NODE_ENV: 'test', TS_EXEC_PWD: appRoot },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, 15_000)
      let status
      let signal
      try {
        ;[status, signal] = await new Promise((resolve, reject) => {
          child.once('error', reject)
          child.once('close', (code, exitSignal) => resolve([code, exitSignal]))
        })
      } finally {
        clearTimeout(timer)
      }
      const output = `${stdout}\n${stderr}`
      assert.equal(timedOut, false, `Ace child timed out:\n${output}`)
      assert.equal(signal, null, `Ace child was killed by ${signal}:\n${output}`)
      const readOptional = async (name) => {
        try {
          return await readFile(path.join(appRoot, name), 'utf8')
        } catch (error) {
          if (error.code === 'ENOENT') return undefined
          throw error
        }
      }
      const events = await readOptional('events.jsonl')
      const result = await readOptional('result.json')
      return {
        status,
        output,
        events: events ? events.trim().split('\n').map((line) => JSON.parse(line)) : [],
        result: result ? JSON.parse(result) : undefined,
      }
    },
  }
}
