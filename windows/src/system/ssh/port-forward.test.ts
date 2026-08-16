import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { buildSshLocalPortForwardArgs, startSshLocalPortForward } from '#/system/ssh/port-forward.ts'

describe('ssh local port forwarding', () => {
  test('builds OpenSSH local forwarding args without shell syntax', () => {
    expect(
      buildSshLocalPortForwardArgs({
        alias: 'prod',
        localBindHost: '127.0.0.1',
        localPort: 5173,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      }),
    ).toEqual([
      '-N',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '-L',
      '127.0.0.1:5173:127.0.0.1:3000',
      '--',
      'prod',
    ])
  })

  test('starts ssh with stdio pipes and no shell', async () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child as never)
    const handle = await startSshLocalPortForward(
      {
        alias: 'prod',
        localBindHost: '127.0.0.1',
        localPort: 5173,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
      { spawn, readyDelayMs: 0 },
    )

    expect(spawn).toHaveBeenCalledWith(
      'ssh',
      expect.arrayContaining(['-L', '127.0.0.1:5173:localhost:3000', '--', 'prod']),
      { stdio: ['ignore', 'ignore', 'pipe'], shell: false },
    )
    expect(handle.pid).toBe(1234)
    handle.stop()
    expect(child.kill).toHaveBeenCalled()
  })

  test('returns a failed start when ssh exits during the ready window', async () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child as never)
    const promise = startSshLocalPortForward(
      {
        alias: 'prod',
        localBindHost: '127.0.0.1',
        localPort: 5173,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
      { spawn, readyDelayMs: 10 },
    )
    child.stderr.emit('data', Buffer.from('bind failed'))
    child.emit('exit', 255, null)

    await expect(promise).rejects.toThrow('bind failed')
  })
})

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    killed: boolean
  }
  child.pid = 1234
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  child.killed = false
  return child
}
