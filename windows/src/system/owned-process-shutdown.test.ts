import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { shutdownOwnedProcess, terminateWindowsProcessTree } from '#/system/owned-process-shutdown.ts'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}))

class FakeOwnedProcess extends EventEmitter {
  pid = 4321
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  connected = true
  send = vi.fn(() => true)
  kill = vi.fn(() => true)
}

describe('owned process shutdown', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('waits for graceful IPC exit without force-killing the process tree', async () => {
    const child = new FakeOwnedProcess()
    const terminateProcessTree = vi.fn(async () => {})

    const shutdown = shutdownOwnedProcess(child, {
      message: { type: 'stop' },
      timeoutMs: 100,
      platform: 'win32',
      terminateProcessTree,
    })
    child.exitCode = 0
    child.emit('exit', 0, null)

    await shutdown

    expect(child.send).toHaveBeenCalledWith({ type: 'stop' })
    expect(terminateProcessTree).not.toHaveBeenCalled()
    expect(child.kill).not.toHaveBeenCalled()
  })

  test('force-kills only the captured Windows process tree after timeout', async () => {
    vi.useFakeTimers()
    const child = new FakeOwnedProcess()
    const terminateProcessTree = vi.fn(async () => {})

    const shutdown = shutdownOwnedProcess(child, {
      message: { type: 'stop' },
      timeoutMs: 100,
      platform: 'win32',
      terminateProcessTree,
    })

    await vi.advanceTimersByTimeAsync(100)
    await shutdown

    expect(terminateProcessTree).toHaveBeenCalledTimes(1)
    expect(terminateProcessTree).toHaveBeenCalledWith(4321)
    expect(child.kill).not.toHaveBeenCalled()
  })

  test('uses taskkill with the exact positive Windows pid and child-tree flags', async () => {
    const taskkill = new EventEmitter()
    mocks.spawn.mockReturnValueOnce(taskkill)

    const termination = terminateWindowsProcessTree(4321)
    taskkill.emit('exit', 0, null)
    await termination

    expect(mocks.spawn).toHaveBeenCalledWith('taskkill.exe', ['/PID', '4321', '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  })

  test('reports a nonzero taskkill exit so the caller can use its direct-child fallback', async () => {
    const taskkill = new EventEmitter()
    mocks.spawn.mockReturnValueOnce(taskkill)

    const termination = terminateWindowsProcessTree(4321)
    taskkill.emit('exit', 1, null)

    await expect(termination).rejects.toThrow('taskkill exited with code 1')
  })
})
