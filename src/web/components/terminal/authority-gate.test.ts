import { describe, expect, test, vi } from 'vitest'
import { writeWithTerminalAuthority } from '#/web/components/terminal/authority-gate.ts'
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

describe('writeWithTerminalAuthority', () => {
  test('writes immediately when the local attachment is controller', async () => {
    const bridge = {
      write: vi.fn(async () => true),
    }

    await expect(
      writeWithTerminalAuthority({
        data: 'ls',
        getSessionId: () => 'session-1',
        getAttachment: () => attachment(),
        bridge,
      }),
    ).resolves.toBe(true)

    expect(bridge.write).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'ls' })
  })

  test.each(['viewer', 'unowned'] as const)('does not write for a %s attachment', async (role) => {
    const bridge = {
      write: vi.fn(async () => true),
    }

    const ok = await writeWithTerminalAuthority({
      data: 'pwd',
      getSessionId: () => 'session-1',
      getAttachment: () =>
        attachment({
          role,
          active: false,
          canTakeover: true,
          controllerStatus: role === 'viewer' ? 'connected' : 'none',
        }),
      bridge,
    })

    expect(ok).toBe(false)
    expect(bridge.write).not.toHaveBeenCalled()
  })

  test('does not write when the session is gone', async () => {
    const bridge = {
      write: vi.fn(async () => true),
    }

    await expect(
      writeWithTerminalAuthority({
        data: 'pwd',
        getSessionId: () => null,
        getAttachment: () => attachment(),
        bridge,
      }),
    ).resolves.toBe(false)

    expect(bridge.write).not.toHaveBeenCalled()
  })
})
