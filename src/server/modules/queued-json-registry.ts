import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function writeJsonRegistryAtomically(dataFile: string, value: unknown, randomId: string): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true })
  const temporaryFile = path.join(path.dirname(dataFile), `.${path.basename(dataFile)}.${randomId}.tmp`)
  let temporaryFileCreated = false
  try {
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    temporaryFileCreated = true
    await rename(temporaryFile, dataFile)
    temporaryFileCreated = false
  } catch (error) {
    if (temporaryFileCreated) await unlink(temporaryFile).catch(() => undefined)
    throw error
  }
}

export async function enqueueFileWrite(
  queues: Map<string, Promise<void>>,
  dataFile: string,
  write: () => Promise<void>,
): Promise<void> {
  const previous = queues.get(dataFile) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(write)
  queues.set(dataFile, operation)
  try {
    await operation
  } finally {
    if (queues.get(dataFile) === operation) queues.delete(dataFile)
  }
}
