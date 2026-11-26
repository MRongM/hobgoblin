import { createHash, randomUUID } from 'node:crypto'
import type { TerminalSessionManager } from '#/server/terminal/terminal-session-manager.ts'
import { terminalSessionScope } from '#/server/terminal/terminal-scope.ts'

export const TERMINAL_CONTROL_TTL_MS = 5 * 60 * 1000
export const TERMINAL_CONTROL_MAX_INPUTS = 1_024
export const TERMINAL_INTERACTIVE_INPUT_IDLE_MS = 2_000

export type MuseControlAction =
  | { action: 'acquire' }
  | { action: 'close' }
  | { action: 'write'; requestId: string; data: string }
  | { action: 'write'; controlId: string; requestId: string; data: string }
  | { action: 'release'; controlId: string }

export type TerminalOpenApiControlInput =
  | { action: 'acquire'; conversationId: string; sessionId: string }
  | { action: 'write'; conversationId: string; sessionId: string; controlId: string; data: string }
  | { action: 'release'; conversationId: string; controlId: string }
  | (MuseControlAction & { repoId: string; sessionId: string })

export type TerminalOpenApiControlResult =
  | { ok: true; action: 'acquire'; controlId: string; terminalSessionId: string; expiresAt: string }
  | { ok: true; action: 'write' | 'release' | 'close' }
  | {
      ok: false
      reason:
        | 'session_unavailable'
        | 'control_in_use'
        | 'control_lost'
        | 'request_conflict'
        | 'control_limit'
        | 'interactive_input_active'
        | 'input_delivery_unknown'
    }

export type CallTerminalControl = (
  input: TerminalOpenApiControlInput,
) => TerminalOpenApiControlResult | Promise<TerminalOpenApiControlResult>

interface TerminalControl {
  scope: string
  clientId: string
  sessionId: string
  attachmentId: string
  returnControl: () => void
  expiresAt: number
  expiry: NodeJS.Timeout
  writes: Map<string, { digest: string; accepted: boolean }>
}

type OpenTerminalSession = NonNullable<ReturnType<TerminalSessionManager<string>['getOpenSessionInScope']>>

interface TerminalInputReceipt {
  digest: string
  accepted: boolean
  expiresAt: number
}

export function createTerminalOpenApiControl(
  manager: TerminalSessionManager<string>,
  close: (sessionId: string) => void,
) {
  const controls = new Map<string, TerminalControl>()
  const receiptsBySession = new WeakMap<OpenTerminalSession, Map<string, TerminalInputReceipt>>()

  function release(control: TerminalControl): void {
    clearTimeout(control.expiry)
    controls.delete(control.attachmentId)
    control.returnControl()
  }

  function writeOnce(session: OpenTerminalSession, requestId: string, data: string): TerminalOpenApiControlResult {
    const now = performance.now()
    let receipts = receiptsBySession.get(session)
    if (!receipts) {
      receipts = new Map()
      receiptsBySession.set(session, receipts)
    }
    for (const [id, receipt] of receipts) {
      if (receipt.expiresAt > now) break
      receipts.delete(id)
    }

    const digest = inputDigest(data)
    const previous = receipts.get(requestId)
    if (previous) {
      return previous.digest === digest ? writeResult(previous.accepted) : { ok: false, reason: 'request_conflict' }
    }
    if (receipts.size >= TERMINAL_CONTROL_MAX_INPUTS) return { ok: false, reason: 'control_limit' }
    const activeControl = controls.get(session.controller?.attachmentId ?? '')
    if (activeControl) {
      if (activeControl.expiresAt > Date.now()) return { ok: false, reason: 'control_in_use' }
      release(activeControl)
    }
    if (
      session.lastInteractiveInputAt !== undefined &&
      now - session.lastInteractiveInputAt < TERMINAL_INTERACTIVE_INPUT_IDLE_MS
    ) {
      return { ok: false, reason: 'interactive_input_active' }
    }

    // Admission and the write are synchronous in the terminal worker. The attached controller stays in place.
    // Record the attempt before writing so a lost response never queues a second write.
    const receipt = { digest, accepted: false, expiresAt: now + TERMINAL_CONTROL_TTL_MS }
    receipts.set(requestId, receipt)
    receipt.accepted = manager.writeScopedInput(session.scope, session.id, data)
    return writeResult(receipt.accepted)
  }

  return {
    handle(clientId: string, input: TerminalOpenApiControlInput): TerminalOpenApiControlResult {
      const repoId = 'repoId' in input ? terminalSessionScope(input.repoId) : undefined
      const scope = 'conversationId' in input ? `conversation:${input.conversationId}` : `workspace:${repoId}`
      const session =
        'sessionId' in input
          ? repoId === undefined
            ? manager.getSession(clientId, input.sessionId)
            : manager.getOpenSessionInScope(repoId, input.sessionId)
          : undefined
      if (input.action === 'write' && !('controlId' in input)) {
        return session ? writeOnce(session, input.requestId, input.data) : { ok: false, reason: 'session_unavailable' }
      }
      if (input.action === 'close') {
        if (!session) return { ok: false, reason: 'session_unavailable' }
        const control = controls.get(session.controller?.attachmentId ?? '')
        close(session.id)
        if (control) release(control)
        return { ok: true, action: 'close' }
      }
      if (input.action === 'acquire') {
        if (!session?.pty || session.phase !== 'open') return { ok: false, reason: 'session_unavailable' }
        const active = controls.get(session.controller?.attachmentId ?? '')
        if (active) {
          if (active.expiresAt > Date.now()) return { ok: false, reason: 'control_in_use' }
          release(active)
        }

        const controlId = randomUUID()
        const attachmentId = `openapi_${controlId}`
        const returnControl = manager.takeTemporaryControl(session.ownerId, session.id, attachmentId)
        if (!returnControl) return { ok: false, reason: 'session_unavailable' }
        const expiresAt = Date.now() + TERMINAL_CONTROL_TTL_MS
        const control: TerminalControl = {
          clientId,
          scope,
          sessionId: session.id,
          attachmentId,
          returnControl,
          expiresAt,
          expiry: setTimeout(() => release(control), TERMINAL_CONTROL_TTL_MS).unref(),
          writes: new Map(),
        }
        controls.set(attachmentId, control)
        return {
          ok: true,
          action: 'acquire',
          controlId,
          terminalSessionId: session.id,
          expiresAt: new Date(expiresAt).toISOString(),
        }
      }

      const control = controls.get(`openapi_${input.controlId}`)
      if (
        !control ||
        control.clientId !== clientId ||
        control.scope !== scope ||
        ('sessionId' in input && control.sessionId !== input.sessionId)
      ) {
        return { ok: false, reason: 'control_lost' }
      }
      if (control.expiresAt <= Date.now()) {
        release(control)
        return { ok: false, reason: 'control_lost' }
      }
      if (input.action === 'release') {
        release(control)
        return { ok: true, action: 'release' }
      }

      const requestId = 'requestId' in input ? input.requestId : undefined
      const digest = requestId ? inputDigest(input.data) : undefined
      if (requestId) {
        const previous = control.writes.get(requestId)
        if (previous) {
          if (previous.digest !== digest) return { ok: false, reason: 'request_conflict' }
          return writeResult(previous.accepted)
        }
        if (control.writes.size >= TERMINAL_CONTROL_MAX_INPUTS) return { ok: false, reason: 'control_limit' }
      }
      if (session?.controller?.attachmentId !== control.attachmentId) {
        release(control)
        return { ok: false, reason: 'control_lost' }
      }
      const muse = 'repoId' in input
      const accepted = manager.writeSession(session.ownerId, session.id, input.data, control.attachmentId, {
        immediate: muse,
      })
      if (requestId && digest) control.writes.set(requestId, { digest, accepted })
      if (!muse && !accepted) return { ok: false, reason: 'session_unavailable' }
      return writeResult(accepted)
    },

    shutdown(): void {
      for (const control of controls.values()) clearTimeout(control.expiry)
      controls.clear()
    },
  }
}

function inputDigest(data: string): string {
  return createHash('sha256').update(data, 'utf16le').digest('hex')
}

function writeResult(accepted: boolean): TerminalOpenApiControlResult {
  return accepted ? { ok: true, action: 'write' } : { ok: false, reason: 'input_delivery_unknown' }
}
