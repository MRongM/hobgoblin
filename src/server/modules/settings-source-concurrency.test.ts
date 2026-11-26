import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultSessionState } from '#/shared/settings-defaults.ts'

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

async function loadSettingsWithRecordedWrites() {
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'gbl-session-save-'))
  previousDataDirectory = process.env.GOBLIN_SERVER_DATA_DIR
  process.env.GOBLIN_SERVER_DATA_DIR = temporaryDirectory
  fsPromisesMocks.writeFile.mockImplementation(async (file: string, contents: string) => {
    writeFileSync(file, contents, 'utf-8')
  })
  const settings = await import('#/server/modules/settings-source.ts')
  await settings.getServerSessionState()
  fsPromisesMocks.writeFile.mockClear()
  return { settings, file: path.join(temporaryDirectory, 'server-settings.json') }
}

test('coalesces consecutive session updates waiting on a file write', async () => {
  const { settings, file } = await loadSettingsWithRecordedWrites()
  const firstWriteStarted = Promise.withResolvers<void>()
  const finishFirstWrite = Promise.withResolvers<void>()
  fsPromisesMocks.writeFile.mockImplementationOnce(async (file: string, contents: string) => {
    firstWriteStarted.resolve()
    await finishFirstWrite.promise
    writeFileSync(file, contents, 'utf-8')
  })
  const resize = (width: number) =>
    settings.setServerSessionState({ ...defaultSessionState(), fileTreePaneSizes: { 'left-right': width } })

  const first = resize(32)
  await firstWriteStarted.promise
  const middle = resize(34)
  const latest = resize(36)
  await vi.waitFor(async () =>
    expect((await settings.getServerSessionState()).fileTreePaneSizes).toEqual({ 'left-right': 36 }),
  )
  finishFirstWrite.resolve()

  const [, savedMiddle, savedLatest] = await Promise.all([first, middle, latest])
  expect(fsPromisesMocks.writeFile).toHaveBeenCalledTimes(2)
  expect(savedMiddle).toEqual(savedLatest)
  expect(JSON.parse(readFileSync(file, 'utf-8'))).toMatchObject({ session: savedLatest })
})

test('skips identical session saves after a successful write and retries a failed save', async () => {
  const { settings, file } = await loadSettingsWithRecordedWrites()
  const initial = await settings.getServerSessionState()
  await settings.setServerSessionState(initial)
  expect(fsPromisesMocks.writeFile).not.toHaveBeenCalled()

  const changed = { ...initial, fileTreePaneSizes: { 'left-right': 32 } }
  fsPromisesMocks.writeFile.mockRejectedValueOnce(new Error('write failed'))
  await expect(settings.setServerSessionState(changed)).rejects.toThrow('write failed')
  const saved = await settings.setServerSessionState(changed)
  await expect(settings.setServerSessionState(changed)).resolves.toEqual(saved)
  expect(fsPromisesMocks.writeFile).toHaveBeenCalledTimes(2)
  expect(JSON.parse(readFileSync(file, 'utf-8'))).toMatchObject({ session: saved })
})
