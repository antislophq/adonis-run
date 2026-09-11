import Run from './run.js'
import type { CommandMetaData } from '@adonisjs/core/types/ace'

export async function getMetaData() {
  return [Run.serialize()]
}

export async function getCommand(metaData: CommandMetaData) {
  return metaData.commandName === Run.commandName ? Run : null
}
