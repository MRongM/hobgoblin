import { describe, expect, test } from 'vitest'
import type { TerminalOwnershipState } from '#/server/terminal/terminal-ownership.ts'
import {
  attachTerminalAttachment,
  authorizeTerminalAttachment,
  claimTerminalAttachmentControl,
  registerTerminalAttachment,
  releaseTerminalAttachmentControl,
  restartTerminalAttachmentControl,
  updateTerminalAttachmentConnection,
} from '#/server/terminal/terminal-ownership.ts'

function createState(overrides?: Partial<TerminalOwnershipState>): TerminalOwnershipState {
  return {
    attachments: new Map(),
    controller: null,
    claimedByOwner: false,
    cols: 80,
    rows: 24,
    ...overrides,
  }
}

describe('registerTerminalAttachment', () => {
  test('registers multiple attachments independently', () => {
    const state = createState()

    registerTerminalAttachment(state, 'a1', 100, 30, true)
    registerTerminalAttachment(state, 'a2', 120, 40, false)

    expect(state.attachments.get('a1')).toEqual({ cols: 100, rows: 30, connected: true })
    expect(state.attachments.get('a2')).toEqual({ cols: 120, rows: 40, connected: false })
  })

  test('preserves existing connected flag for the same attachment when omitted', () => {
    const state = createState()

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    registerTerminalAttachment(state, 'a1', 100, 30)

    expect(state.attachments.get('a1')).toEqual({ cols: 100, rows: 30, connected: true })
  })
})

describe('attachTerminalAttachment', () => {
  test('auto-claims first connected attachment for an unclaimed session', () => {
    const state = createState()

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    const effect = attachTerminalAttachment(state, 'a1')

    expect(effect).toEqual({ emitOwnership: true })
    expect(state.controller).toEqual({ attachmentId: 'a1', status: 'connected' })
    expect(state.claimedByOwner).toBe(true)
  })

  test('does not replace an existing controller through ordinary attach', () => {
    const state = createState({
      controller: { attachmentId: 'a1', status: 'connected' },
      claimedByOwner: true,
    })

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    registerTerminalAttachment(state, 'a2', 100, 30, true)
    const effect = attachTerminalAttachment(state, 'a2')

    expect(effect.emitOwnership).toBe(false)
    expect(state.controller).toEqual({ attachmentId: 'a1', status: 'connected' })
  })

  test('auto-claims a connected attachment when a previously claimed session has no controller', () => {
    const state = createState({ claimedByOwner: true })

    registerTerminalAttachment(state, 'a2', 100, 30, true)
    const effect = attachTerminalAttachment(state, 'a2')

    expect(effect.resizeTo).toEqual({ cols: 100, rows: 30 })
    expect(state.controller).toEqual({ attachmentId: 'a2', status: 'connected' })
  })
})

describe('claimTerminalAttachmentControl', () => {
  test('takeover replaces an existing controller', () => {
    const state = createState({
      controller: { attachmentId: 'a1', status: 'connected' },
      claimedByOwner: true,
    })

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    registerTerminalAttachment(state, 'a2', 120, 36, true)
    const effect = claimTerminalAttachmentControl(state, 'a2')

    expect(effect.resizeTo).toEqual({ cols: 120, rows: 36 })
    expect(state.controller).toEqual({ attachmentId: 'a2', status: 'connected' })
    expect(state.claimedByOwner).toBe(true)
  })

  test('does not claim a disconnected attachment', () => {
    const state = createState()

    registerTerminalAttachment(state, 'a1', 80, 24, false)
    const effect = claimTerminalAttachmentControl(state, 'a1')

    expect(effect.emitOwnership).toBe(false)
    expect(state.controller).toBeNull()
    expect(state.attachments.has('a1')).toBe(true)
  })
})

describe('restartTerminalAttachmentControl', () => {
  test('keeps controller for matching connected attachment', () => {
    const state = createState()

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    claimTerminalAttachmentControl(state, 'a1')
    restartTerminalAttachmentControl(state, 'a1')

    expect(state.controller).toEqual({ attachmentId: 'a1', status: 'connected' })
    expect(state.claimedByOwner).toBe(true)
  })

  test('clears controller when restart attachment is disconnected', () => {
    const state = createState({
      controller: { attachmentId: 'a1', status: 'connected' },
      claimedByOwner: true,
    })

    registerTerminalAttachment(state, 'a1', 80, 24, false)
    restartTerminalAttachmentControl(state, 'a1')

    expect(state.controller).toBeNull()
  })
})

describe('updateTerminalAttachmentConnection', () => {
  test('clears the controller immediately when the controller disconnects', () => {
    const state = createState({
      controller: { attachmentId: 'a1', status: 'connected' },
      claimedByOwner: true,
    })

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    const effect = updateTerminalAttachmentConnection(state, 'a1', false)

    expect(effect.emitOwnership).toBe(true)
    expect(state.controller).toBeNull()
    expect(state.attachments.get('a1')?.connected).toBe(false)
  })

  test('auto-claims on reconnect when there is no controller', () => {
    const state = createState({ claimedByOwner: true })

    registerTerminalAttachment(state, 'a2', 100, 30, false)
    const effect = updateTerminalAttachmentConnection(state, 'a2', true)

    expect(effect.resizeTo).toEqual({ cols: 100, rows: 30 })
    expect(state.controller).toEqual({ attachmentId: 'a2', status: 'connected' })
  })

  test('ignores connection updates for unknown attachments', () => {
    const state = createState()

    const effect = updateTerminalAttachmentConnection(state, 'missing', true)

    expect(effect.emitOwnership).toBe(false)
    expect(state.controller).toBeNull()
  })
})

describe('authorizeTerminalAttachment', () => {
  test('allows controller write resize and restart actions', () => {
    const state = createState({ controller: { attachmentId: 'a1', status: 'connected' }, claimedByOwner: true })

    registerTerminalAttachment(state, 'a1', 80, 24, true)

    expect(authorizeTerminalAttachment(state, 'a1', 'write')).toEqual({ ok: true })
    expect(authorizeTerminalAttachment(state, 'a1', 'resize')).toEqual({ ok: true })
    expect(authorizeTerminalAttachment(state, 'a1', 'restart')).toEqual({ ok: true })
  })

  test('denies viewer write resize and restart actions', () => {
    const state = createState({ controller: { attachmentId: 'a1', status: 'connected' }, claimedByOwner: true })

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    registerTerminalAttachment(state, 'a2', 80, 24, true)

    expect(authorizeTerminalAttachment(state, 'a2', 'write')).toEqual({ ok: false, reason: 'not-controller' })
    expect(authorizeTerminalAttachment(state, 'a2', 'resize')).toEqual({ ok: false, reason: 'not-controller' })
    expect(authorizeTerminalAttachment(state, 'a2', 'restart')).toEqual({ ok: false, reason: 'not-controller' })
  })

  test('allows connected attachments to request takeover', () => {
    const state = createState({ controller: { attachmentId: 'a1', status: 'connected' }, claimedByOwner: true })

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    registerTerminalAttachment(state, 'a2', 80, 24, true)

    expect(authorizeTerminalAttachment(state, 'a2', 'takeover')).toEqual({ ok: true })
  })

  test('denies unknown attachments', () => {
    const state = createState({ controller: { attachmentId: 'a1', status: 'connected' }, claimedByOwner: true })

    registerTerminalAttachment(state, 'a1', 80, 24, true)

    expect(authorizeTerminalAttachment(state, 'missing', 'write')).toEqual({
      ok: false,
      reason: 'unknown-attachment',
    })
  })

  test('denies controller actions when the session has no controller', () => {
    const state = createState({ claimedByOwner: true })

    registerTerminalAttachment(state, 'a1', 80, 24, true)

    expect(authorizeTerminalAttachment(state, 'a1', 'write')).toEqual({ ok: false, reason: 'session-unowned' })
  })
})

describe('releaseTerminalAttachmentControl', () => {
  test('is idempotent after immediate controller release', () => {
    const state = createState({
      controller: { attachmentId: 'a1', status: 'connected' },
      claimedByOwner: true,
    })

    registerTerminalAttachment(state, 'a1', 80, 24, true)
    updateTerminalAttachmentConnection(state, 'a1', false)

    expect(releaseTerminalAttachmentControl(state, 'a1')).toBe(false)
    expect(state.controller).toBeNull()
  })
})
