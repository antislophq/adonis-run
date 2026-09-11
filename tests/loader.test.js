import assert from 'node:assert/strict'
import test from 'node:test'
import { getCommand, getMetaData } from '@antislop/adonis-run/commands'
import Run from '@antislop/adonis-run/commands/run'

test('exports metadata for exactly the run command with application boot enabled', async () => {
  const metadata = await getMetaData()
  assert.equal(metadata.length, 1)
  const [command] = metadata
  assert.equal(command.commandName, 'run')
  assert.equal(command.description, 'Run a script file with the application booted')
  assert.equal(command.options.startApp, true)
  assert.deepEqual(command, Run.serialize())
  assert.deepEqual(command.args.map(({ name, type, required }) => ({ name, type, required })), [
    { name: 'file', type: 'string', required: true },
    { name: 'scriptArgs', type: 'spread', required: false },
  ])
})

test('loads the exported command class from its metadata', async () => {
  const [metadata] = await getMetaData()
  assert.equal(await getCommand(metadata), Run)
})

test('returns null for commands it does not own, including case mismatches', async () => {
  const [metadata] = await getMetaData()
  for (const commandName of ['unknown', 'Run', 'run:other', '']) {
    assert.equal(await getCommand({ ...metadata, commandName }), null)
  }
})
