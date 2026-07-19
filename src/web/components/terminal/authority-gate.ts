import type { TerminalWriteInput } from '#/shared/terminal.ts'
import type { TerminalAttachmentSnapshot } from '#/web/components/terminal/types.ts'

export interface TerminalAuthorityBridge {
  write(input: TerminalWriteInput): Promise<boolean>
}

export async function writeWithTerminalAuthority(input: {
  data: string
  getSessionId: () => string | null
  getAttachment: () => TerminalAttachmentSnapshot | null | undefined
  bridge: TerminalAuthorityBridge
}): Promise<boolean> {
  const sessionId = input.getSessionId()
  if (!sessionId) return false

  const attachment = input.getAttachment()
  if (attachment?.role !== 'controller') return false

  return await input.bridge.write({ sessionId, data: input.data })
}
