import type { TerminalTakeoverInput, TerminalTakeoverResult, TerminalWriteInput } from '#/shared/terminal.ts'
import type { TerminalAttachmentSnapshot } from '#/web/components/terminal/types.ts'

export interface TerminalAuthorityBridge {
  write(input: TerminalWriteInput): Promise<boolean>
  takeover(input: TerminalTakeoverInput): Promise<TerminalTakeoverResult>
}

export async function writeWithTerminalAuthority(input: {
  data: string
  getSessionId: () => string | null
  getAttachment: () => TerminalAttachmentSnapshot | null | undefined
  currentSize: () => { cols: number; rows: number }
  bridge: TerminalAuthorityBridge
  applyTakeover: (result: Extract<TerminalTakeoverResult, { ok: true }>) => void
}): Promise<boolean> {
  const sessionId = input.getSessionId()
  if (!sessionId) return false

  const attachment = input.getAttachment()
  if (attachment?.role !== 'controller') {
    const size = input.currentSize()
    const takeover = await input.bridge.takeover({ sessionId, cols: size.cols, rows: size.rows })
    if (!takeover.ok) return false
    input.applyTakeover(takeover)
    const next = input.getAttachment()
    if (next?.role !== 'controller') return false
  }

  return await input.bridge.write({ sessionId, data: input.data })
}
