import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ServerTerminalSocket } from '#/server/terminal/terminal-host.ts'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}))

let originalElectronRunAsNode: string | undefined

class FakeSpawnedWorker extends EventEmitter {
  pid = 1234
  sent: unknown[] = []

  send(message: unknown): boolean {
    this.sent.push(message)
    return true
  }

  kill(): void {}
  disconnect(): void {}
}

describe('terminal worker process spawning', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    originalElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
    delete process.env.ELECTRON_RUN_AS_NODE
    mocks.spawn.mockReturnValue(new FakeSpawnedWorker())
  })

  afterEach(() => {
    if (originalElectronRunAsNode === undefined) {
      delete process.env.ELECTRON_RUN_AS_NODE
    } else {
      process.env.ELECTRON_RUN_AS_NODE = originalElectronRunAsNode
    }
  })

  test('runs Electron packaged worker children in Node mode', async () => {
    const { WorkerBackedTerminalHost } = await import('#/server/terminal/terminal-worker-host.ts')
    const host = new WorkerBackedTerminalHost({ workerEntry: 'C:\\App\\resources\\app.asar\\dist\\server\\terminal-worker.js' })
    const socket: ServerTerminalSocket = { send: vi.fn(), close: vi.fn() }

    host.registerSocket('client_1', 'attachment_a', socket)

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ['C:\\App\\resources\\app.asar\\dist\\server\\terminal-worker.js'],
      expect.objectContaining({
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      }),
    )
  })
})
