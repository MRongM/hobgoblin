import { describe, expect, test, vi } from 'vitest'
import { createPortForwardingManagerForTest } from '#/server/modules/port-forwarding.ts'
import type { SshLocalPortForwardHandle } from '#/system/ssh/port-forward.ts'

const REMOTE_TARGET = {
  id: 'ssh-config://prod/srv/repo',
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/repo',
  displayName: 'prod:repo',
}

describe('port forwarding manager', () => {
  test('starts and lists a remote repo session', async () => {
    const handle = fakeHandle()
    const manager = testManager({ handle })

    const result = await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })

    expect(result.ok).toBe(true)
    expect(result.ok ? result.session.status : '').toBe('active')
    expect(result.ok ? result.session.actualLocalPort : null).toBe(3000)
    expect(result.ok ? result.session.localUrl : null).toBe('http://127.0.0.1:3000')
    await expect(manager.list('ssh-config://prod/srv/repo')).resolves.toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ remotePort: 3000, status: 'active' })],
    })
  })

  test('falls back to an allocated port when requested port is occupied', async () => {
    const manager = testManager({ allocatedPort: 61888, handle: fakeHandle() })

    const result = await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: 3000,
      remoteHost: 'localhost',
      remotePort: 3000,
    })

    expect(result.ok ? result.session.requestedLocalPort : null).toBe(3000)
    expect(result.ok ? result.session.actualLocalPort : null).toBe(61888)
  })

  test('rejects local repos', async () => {
    const manager = testManager()
    await expect(
      manager.start({
        repoId: '/tmp/repo',
        localBindHost: '127.0.0.1',
        localPort: null,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
  })

  test('marks a running session failed when ssh exits unexpectedly', async () => {
    const handle = fakeHandle()
    const manager = testManager({ handle })
    const result = await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })
    expect(result.ok).toBe(true)

    handle.emitExit({ code: 255, signal: null, stderr: 'connection lost' })

    const list = await manager.list('ssh-config://prod/srv/repo')
    expect(list.ok ? list.sessions[0]?.status : '').toBe('failed')
    expect(list.ok ? list.sessions[0]?.message : '').toBe('connection lost')
  })

  test('stops sessions for one repo without touching another repo', async () => {
    const first = fakeHandle()
    const second = fakeHandle()
    const manager = testManager({ handles: [first, second] })
    await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })
    await manager.start({
      repoId: 'ssh-config://prod/srv/other',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3001,
    })

    await manager.stopForRepo('ssh-config://prod/srv/repo')

    expect(first.stop).toHaveBeenCalled()
    expect(second.stop).not.toHaveBeenCalled()
  })

  test('deletes stopped session history without touching active sessions', async () => {
    const stoppedHandle = fakeHandle()
    const activeHandle = fakeHandle()
    const manager = testManager({ handles: [stoppedHandle, activeHandle] })
    await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })
    await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3001,
    })
    await manager.stop('pf_1')

    await expect(manager.delete('pf_1')).resolves.toEqual({ ok: true, deletedId: 'pf_1' })
    await expect(manager.delete('pf_2')).resolves.toEqual({ ok: false, message: 'error.port-forward-delete-active' })

    await expect(manager.list('ssh-config://prod/srv/repo')).resolves.toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ id: 'pf_2', status: 'active' })],
    })
    expect(stoppedHandle.stop).toHaveBeenCalledTimes(1)
    expect(activeHandle.stop).not.toHaveBeenCalled()
  })

  test('reactivates a stopped session in place', async () => {
    const firstHandle = fakeHandle()
    const secondHandle = fakeHandle()
    const manager = testManager({ handles: [firstHandle, secondHandle] })
    await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: 3000,
      remoteHost: '127.0.0.1',
      remotePort: 5173,
    })
    await manager.stop('pf_1')

    const result = await manager.activate('pf_1')

    expect(result.ok).toBe(true)
    expect(result.ok ? result.session : null).toMatchObject({
      id: 'pf_1',
      requestedLocalPort: 3000,
      actualLocalPort: 3000,
      remotePort: 5173,
      status: 'active',
      localUrl: 'http://127.0.0.1:3000',
    })
    await expect(manager.list('ssh-config://prod/srv/repo')).resolves.toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ id: 'pf_1', status: 'active' })],
    })
    firstHandle.emitExit({ code: 0, signal: null, stderr: '' })
    await expect(manager.list('ssh-config://prod/srv/repo')).resolves.toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ id: 'pf_1', status: 'active' })],
    })
    expect(firstHandle.stop).toHaveBeenCalledTimes(1)
    expect(secondHandle.stop).not.toHaveBeenCalled()
  })

  test('rejects reactivation while a session is active or starting', async () => {
    const manager = testManager({ handle: fakeHandle() })
    await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })

    await expect(manager.activate('pf_1')).resolves.toEqual({
      ok: false,
      message: 'error.port-forward-already-active',
    })
  })
})

function testManager(
  options: {
    allocatedPort?: number
    handle?: ReturnType<typeof fakeHandle>
    handles?: ReturnType<typeof fakeHandle>[]
  } = {},
) {
  const handles = [...(options.handles ?? (options.handle ? [options.handle] : [fakeHandle()]))]
  return createPortForwardingManagerForTest({
    resolveRemoteTarget: async (ref) => ({
      target: { ...REMOTE_TARGET, id: `ssh-config://${ref.alias}${ref.remotePath}`, remotePath: ref.remotePath },
    }),
    reservePort: async (_host, preferred) => options.allocatedPort ?? preferred,
    startForward: async () => handles.shift() ?? fakeHandle(),
    now: (() => {
      let tick = 0
      return () => new Date(Date.UTC(2026, 5, 15, 12, 0, (tick += 1)))
    })(),
    id: (() => {
      let tick = 0
      return () => `pf_${(tick += 1)}`
    })(),
  })
}

function fakeHandle(): SshLocalPortForwardHandle & {
  stop: ReturnType<typeof vi.fn<() => void>>
  emitExit(exit: { code: number | null; signal: NodeJS.Signals | null; stderr: string }): void
} {
  let listener: ((exit: { code: number | null; signal: NodeJS.Signals | null; stderr: string }) => void) | null = null
  return {
    pid: 1234,
    stop: vi.fn<() => void>(),
    stderrText: () => '',
    onExit(next) {
      listener = next
      return () => {
        listener = null
      }
    },
    emitExit(exit) {
      listener?.(exit)
    },
  }
}
