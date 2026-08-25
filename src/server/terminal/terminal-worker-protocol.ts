import type {
  TerminalAttachInput,
  TerminalAttachResult,
  TerminalCatalogMutationResult,
  TerminalCloseSessionsInput,
  TerminalCloseSessionsResult,
  TerminalCloseResult,
  TerminalCreateInput,
  TerminalMutationResult,
  TerminalNotifyBellInput,
  TerminalOutputExcerpt,
  TerminalOutputExcerptInput,
  TerminalScreenSnapshot,
  TerminalScreenSnapshotInput,
  TerminalReorderInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionInput,
  TerminalSessionSnapshot,
  TerminalSessionSnapshotInput,
  TerminalSessionSummary,
  TerminalTakeoverInput,
  TerminalTakeoverResult,
  TerminalWriteInput,
} from '#/shared/terminal.ts'
import type { TelegramTerminalInputSubmissionResult } from '#/shared/telegram-terminal-input.ts'

export interface TerminalWorkerRequestInputs {
  attach: TerminalAttachInput
  restart: TerminalRestartInput
  write: TerminalWriteInput
  resize: TerminalResizeInput
  takeover: TerminalTakeoverInput
  close: TerminalSessionInput
  'close-sessions': TerminalCloseSessionsInput
  'notify-bell': TerminalNotifyBellInput
  'list-sessions': { repoRoot: string }
  create: TerminalCreateInput
  prune: { repoRoot: string }
  'session-snapshot': TerminalSessionSnapshotInput
  'output-excerpt': TerminalOutputExcerptInput
  'screen-snapshot': TerminalScreenSnapshotInput
  'telegram-input': { text: string }
  reorder: TerminalReorderInput
}

export interface TerminalWorkerResponseOutputs {
  attach: TerminalAttachResult
  restart: TerminalAttachResult
  write: TerminalMutationResult
  resize: TerminalMutationResult
  takeover: TerminalTakeoverResult
  close: TerminalCloseResult
  'close-sessions': TerminalCloseSessionsResult
  'notify-bell': TerminalMutationResult
  'list-sessions': TerminalSessionSummary[]
  create: TerminalCatalogMutationResult
  prune: { pruned: number; remaining: number }
  'session-snapshot': TerminalSessionSnapshot | null
  'output-excerpt': TerminalOutputExcerpt | null
  'screen-snapshot': TerminalScreenSnapshot | null
  'telegram-input': TelegramTerminalInputSubmissionResult
  reorder: TerminalMutationResult
}

export type TerminalWorkerAction = keyof TerminalWorkerRequestInputs

export type TerminalWorkerActionRequest = {
  [TAction in TerminalWorkerAction]: {
    type: 'request'
    requestId: string
    action: TAction
    clientId: string
    input: TerminalWorkerRequestInputs[TAction]
  }
}[TerminalWorkerAction]

export type TerminalWorkerRequest =
  | TerminalWorkerActionRequest
  | {
      type: 'socket-register'
      socketId: string
      clientId: string
      attachmentId: string
    }
  | {
      type: 'socket-unregister'
      socketId: string
      clientId: string
      attachmentId: string
    }
  | {
      type: 'socket-message'
      socketId: string
      clientId: string
      attachmentId: string
      payload: string
    }
  | {
      type: 'shutdown'
    }

export type TerminalWorkerSuccessMessage = {
  [TAction in TerminalWorkerAction]: {
    type: 'response'
    requestId: string
    ok: true
    payload: TerminalWorkerResponseOutputs[TAction]
  }
}[TerminalWorkerAction]

export type TerminalWorkerFailureMessage = {
  type: 'response'
  requestId: string
  ok: false
  error: string
}

export type TerminalWorkerMessage =
  | TerminalWorkerSuccessMessage
  | TerminalWorkerFailureMessage
  | {
      type: 'socket-send'
      socketId: string
      payload: string
    }
  | {
      type: 'socket-close'
      socketId: string
      code?: number
      reason?: string
    }
