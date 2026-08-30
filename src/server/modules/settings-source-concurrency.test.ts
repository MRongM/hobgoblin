import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const fsPromisesMocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(),
}))

vi.mock('node:fs/promises', async () => ({
  ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
  mkdir: fsPromisesMocks.mkdir,
  writeFile: fsPromisesMocks.writeFile,
}))

interface PendingWrite {
  file: string
  contents: string
  complete(): void
}

function pendingWriteAt(writes: PendingWrite[], index: number): PendingWrite {
  const write = writes[index]
  if (!write) throw new Error(`Missing pending settings write ${index}`)
  return write
}

let temporaryDirectory: string | null = null
let previousDataDirectory = process.env.GOBLIN_SERVER_DATA_DIR

afterEach(async () => {
  const mod = await import('#/server/modules/settings-source.ts')
  mod.resetServerSettingsSourceForTests()
  fsPromisesMocks.mkdir.mockClear()
  fsPromisesMocks.writeFile.mockReset()
  vi.resetModules()
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true })
  temporaryDirectory = null
  if (previousDataDirectory === undefined) delete process.env.GOBLIN_SERVER_DATA_DIR
  else process.env.GOBLIN_SERVER_DATA_DIR = previousDataDirectory
})

test('serializes settings writes so the last accepted Windows shell preference wins after reload', async () => {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'gbl-settings-write-order-'))
  previousDataDirectory = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = temporaryDirectory
  const settingsFile = path.join(temporaryDirectory, 'server-settings.json')
  writeFileSync(settingsFile, JSON.stringify({ windowsInternalTerminalShell: 'auto' }), 'utf-8')
  fsPromisesMocks.writeFile.mockImplementation(async (file: string, contents: string) => {
    writeFileSync(file, contents, 'utf-8')
  })
  const mod = await import('#/server/modules/settings-source.ts')
  await mod.getServerSettingsPrefs()
  fsPromisesMocks.writeFile.mockReset()
  const pendingWrites: PendingWrite[] = []
  fsPromisesMocks.writeFile.mockImplementation(
    (file: string, contents: string) =>
      new Promise<void>((resolve) => {
        pendingWrites.push({
          file,
          contents,
          complete() {
            writeFileSync(file, contents, 'utf-8')
            resolve()
          },
        })
      }),
  )
  const firstWrite = mod.updateServerSettingsPrefs({ windowsInternalTerminalShell: 'wsl' })
  await vi.waitFor(() => expect(pendingWrites).toHaveLength(1))
  const secondWrite = mod.updateServerSettingsPrefs({ windowsInternalTerminalShell: 'cmd' })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const writesStartedBeforeFirstCompletion = pendingWrites.length

  if (pendingWrites[1]) {
    pendingWrites[1].complete()
    await secondWrite
    pendingWriteAt(pendingWrites, 0).complete()
    await firstWrite
  } else {
    pendingWriteAt(pendingWrites, 0).complete()
    await firstWrite
    await vi.waitFor(() => expect(pendingWrites).toHaveLength(2))
    pendingWriteAt(pendingWrites, 1).complete()
    await secondWrite
  }

  expect(writesStartedBeforeFirstCompletion).toBe(1)
  expect(JSON.parse(readFileSync(settingsFile, 'utf-8'))).toMatchObject({
    windowsInternalTerminalShell: 'cmd',
  })
})
