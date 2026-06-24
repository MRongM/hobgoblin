import type { TerminalController } from '#/shared/terminal.ts'

export interface TerminalAttachmentState {
  cols: number
  rows: number
  connected: boolean
}

export interface TerminalOwnershipState {
  attachments: Map<string, TerminalAttachmentState>
  controller: TerminalController | null
  claimedByOwner: boolean
  cols: number
  rows: number
}

export interface TerminalOwnershipEffect {
  resizeTo?: { cols: number; rows: number }
  emitOwnership: boolean
}

export type TerminalAuthorityAction = 'write' | 'resize' | 'restart' | 'takeover'
export type TerminalAuthorityReason = 'not-controller' | 'session-unowned' | 'unknown-attachment'

export type TerminalAuthorityResult = { ok: true } | { ok: false; reason: TerminalAuthorityReason }

export function registerTerminalAttachment(
  state: TerminalOwnershipState,
  attachmentId: string,
  cols: number,
  rows: number,
  connected?: boolean,
): void {
  const previous = state.attachments.get(attachmentId)
  state.attachments.set(attachmentId, {
    cols,
    rows,
    connected: connected ?? previous?.connected ?? false,
  })
}

export function attachTerminalAttachment(state: TerminalOwnershipState, attachmentId: string): TerminalOwnershipEffect {
  if (state.controller !== null) return { emitOwnership: false }
  return claimTerminalAttachmentControl(state, attachmentId)
}

export function claimTerminalAttachmentControl(
  state: TerminalOwnershipState,
  attachmentId: string,
): TerminalOwnershipEffect {
  const attachment = state.attachments.get(attachmentId)
  if (!attachment?.connected) return { emitOwnership: false }

  const sizeChanged = state.cols !== attachment.cols || state.rows !== attachment.rows
  state.controller = { attachmentId, status: 'connected' }
  state.claimedByOwner = true

  return sizeChanged
    ? { emitOwnership: false, resizeTo: { cols: attachment.cols, rows: attachment.rows } }
    : { emitOwnership: true }
}

export function restartTerminalAttachmentControl(state: TerminalOwnershipState, attachmentId: string): void {
  const attachment = state.attachments.get(attachmentId)
  state.controller = attachment?.connected ? { attachmentId, status: 'connected' } : null
  if (state.controller) state.claimedByOwner = true
}

export function updateTerminalAttachmentConnection(
  state: TerminalOwnershipState,
  attachmentId: string,
  connected: boolean,
): TerminalOwnershipEffect {
  const attachment = state.attachments.get(attachmentId)
  if (!attachment) return { emitOwnership: false }

  const wasConnected = attachment.connected
  attachment.connected = connected

  if (state.controller?.attachmentId === attachmentId && !connected) {
    state.controller = null
    return { emitOwnership: true }
  }

  if (!wasConnected && connected && state.controller === null) {
    return claimTerminalAttachmentControl(state, attachmentId)
  }

  return { emitOwnership: false }
}

export function authorizeTerminalAttachment(
  state: TerminalOwnershipState,
  attachmentId: string,
  action: TerminalAuthorityAction,
): TerminalAuthorityResult {
  const attachment = state.attachments.get(attachmentId)
  if (!attachment?.connected) return { ok: false, reason: 'unknown-attachment' }
  if (action === 'takeover') return { ok: true }
  if (!state.controller) return { ok: false, reason: 'session-unowned' }
  if (state.controller.attachmentId !== attachmentId) return { ok: false, reason: 'not-controller' }
  return { ok: true }
}

export function releaseTerminalAttachmentControl(state: TerminalOwnershipState, attachmentId: string): boolean {
  if (state.controller?.attachmentId !== attachmentId) return false
  const attachment = state.attachments.get(attachmentId)
  if (attachment?.connected) return false
  state.controller = null
  return true
}
