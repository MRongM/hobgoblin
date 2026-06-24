import { describe, expect, test, vi } from 'vitest'
import { writeWithTerminalAuthority } from '#/web/components/terminal/authority-gate.ts'
import type { TerminalTakeoverResult } from '#/shared/terminal.ts'
import type { TerminalAttachmentSnapshot } from '#/web/components/terminal/types.ts'

function attachment(overrides: Partial<TerminalAttachmentSnapshot> = {}): TerminalAttachmentSnapshot {
  return {
    role: 'controller',
    controllerStatus: 'connected',
    active: true,
    canTakeover: false,
    canonicalCols: 100,
    canonicalRows: 30,
    ...overrides,
  }
}

function takeoverResult(overrides: Partial<Extract<TerminalTakeoverResult, { ok: true }>> = {}): TerminalTakeoverResult {
  return {
    ok: true,
    sessionId: 'session-1',
    role: 'controller',
    controllerStatus: 'connected',
    controller: { attachmentId: 'attachment_local', status: 'connected' },
    canonicalCols: 100,
    canonicalRows: 30,
    phase: 'open',
    ...overrides,
  }
}

describe('writeWithTerminalAuthority', () => {
  test('writes immediately when the local attachment is controller', async () => {
    const bridge = {
      write: vi.fn(async () => true),
      takeover: vi.fn(async () => takeoverResult()),
    }

    await expect(
      writeWithTerminalAuthority({
        data: 'ls',
        getSessionId: () => 'session-1',
        getAttachment: () => attachment(),
        currentSize: () => ({ cols: 100, rows: 30 }),
        bridge,
        applyTakeover: vi.fn(),
      }),
    ).resolves.toBe(true)

    expect(bridge.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'ls' })
    expect(bridge.takeover).not.toHaveBeenCalled()
  })

  test('promotes a viewer through takeover before writing', async () => {
    const result = takeoverResult({ canonicalCols: 120, canonicalRows: 40 })
    const bridge = {
      write: vi.fn(async () => true),
      takeover: vi.fn(async () => result),
    }
    const applyTakeover = vi.fn()
    let current = attachment({
      role: 'viewer',
      active: false,
      canTakeover: true,
      canonicalCols: 120,
      canonicalRows: 40,
    })

    const ok = await writeWithTerminalAuthority({
      data: 'pwd',
      getSessionId: () => 'session-1',
      getAttachment: () => current,
      currentSize: () => ({ cols: 120, rows: 40 }),
      bridge,
      applyTakeover: (next) => {
        applyTakeover(next)
        current = attachment({ role: next.role, canonicalCols: next.canonicalCols, canonicalRows: next.canonicalRows })
      },
    })

    expect(ok).toBe(true)
    expect(bridge.takeover).toHaveBeenCalledWith({ sessionId: 'session-1', cols: 120, rows: 40 })
    expect(applyTakeover).toHaveBeenCalledWith(result)
    expect(bridge.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'pwd' })
  })

  test('does not write when takeover fails', async () => {
    const bridge = {
      write: vi.fn(async () => true),
      takeover: vi.fn(async () => ({ ok: false as const, message: 'error.not-controller' })),
    }

    await expect(
      writeWithTerminalAuthority({
        data: 'pwd',
        getSessionId: () => 'session-1',
        getAttachment: () => attachment({ role: 'viewer', active: false, canTakeover: true }),
        currentSize: () => ({ cols: 100, rows: 30 }),
        bridge,
        applyTakeover: vi.fn(),
      }),
    ).resolves.toBe(false)

    expect(bridge.write).not.toHaveBeenCalled()
  })

  test('does not write when the session is gone', async () => {
    const bridge = {
      write: vi.fn(async () => true),
      takeover: vi.fn(async () => takeoverResult()),
    }

    await expect(
      writeWithTerminalAuthority({
        data: 'pwd',
        getSessionId: () => null,
        getAttachment: () => attachment(),
        currentSize: () => ({ cols: 100, rows: 30 }),
        bridge,
        applyTakeover: vi.fn(),
      }),
    ).resolves.toBe(false)

    expect(bridge.write).not.toHaveBeenCalled()
    expect(bridge.takeover).not.toHaveBeenCalled()
  })
})
