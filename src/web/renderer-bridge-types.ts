import type { RendererBootstrapSnapshot, RendererNativeCapability, RendererRuntimeKind } from '#/shared/bootstrap.ts'
import type { RpcEvent, RpcRequest, SettingsPage } from '#/shared/rpc.ts'
import type { RendererEffectIntent } from '#/shared/renderer-effect-intents.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import type {
  ClipboardBinaryFilePayload,
  SaveClipboardBinaryFilesInput,
  SaveClipboardBinaryFilesResult,
} from '#/shared/clipboard-binary-temp-files.ts'
import type {
  FileTreeClipboardFilePayload,
  FileTreeClipboardReadInput,
  FileTreeClipboardReadResult,
  FileTreeClipboardWriteResult,
} from '#/shared/file-tree-clipboard.ts'
import type {
  TerminalCatalogMutationResult,
  TerminalCloseResult,
  TerminalAttachInput,
  TerminalAttachResult,
  TerminalCreateInput,
  TerminalOpenTmuxSessionsInput,
  TerminalOpenTmuxSessionsResult,
  TerminalExitEvent,
  TerminalMutationResult,
  TerminalNotifyBellInput,
  TerminalOutputEvent,
  TerminalReorderInput,
  TerminalResizeInput,
  TerminalReturnToBottomInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalSessionSnapshotInput,
  TerminalSessionSummary,
  TerminalSessionInput,
  TerminalTakeoverInput,
  TerminalTakeoverResult,
  TerminalTmuxPageInput,
  TerminalTitleEvent,
  TerminalWriteInput,
} from '#/shared/terminal.ts'
import type { TerminalOwnershipViewModel } from '#/web/components/terminal/types.ts'
import type { DetachedFileAreaWindowRequest, OpenDetachedFileAreaWindowResult } from '#/shared/file-area.ts'

export interface RendererTerminalBridge {
  attach: (input: TerminalAttachInput) => Promise<TerminalAttachResult>
  restart: (input: TerminalRestartInput) => Promise<TerminalAttachResult>
  write: (input: TerminalWriteInput) => Promise<TerminalMutationResult>
  resize: (input: TerminalResizeInput) => Promise<TerminalMutationResult>
  returnToBottom: (input: TerminalReturnToBottomInput) => Promise<TerminalMutationResult>
  pageTmux: (input: TerminalTmuxPageInput) => Promise<TerminalMutationResult>
  takeover: (input: TerminalTakeoverInput) => Promise<TerminalTakeoverResult>
  close: (input: TerminalSessionInput) => Promise<TerminalCloseResult>
  create: (input: TerminalCreateInput) => Promise<TerminalCatalogMutationResult>
  openTmuxSessions: (input: TerminalOpenTmuxSessionsInput) => Promise<TerminalOpenTmuxSessionsResult>
  pruneTerminals: (repoRoot: string) => Promise<{ pruned: number; remaining: number }>
  listSessions: (input: { repoRoot: string }) => Promise<TerminalSessionSummary[]>
  getSessionSnapshot: (input: TerminalSessionSnapshotInput) => Promise<TerminalSessionSnapshot | null>
  markTelegramInputTarget?: (input: TerminalSessionSnapshotInput) => Promise<TerminalMutationResult>
  reorder: (input: TerminalReorderInput) => Promise<TerminalMutationResult>
  notifyBell: (input: TerminalNotifyBellInput) => Promise<TerminalMutationResult>
  sendTestNotification: () => Promise<boolean>
  setBadge: (count: number) => void
  onOutput: (cb: (event: TerminalOutputEvent) => void) => () => void
  onTitle: (cb: (event: TerminalTitleEvent) => void) => () => void
  onExit: (cb: (event: TerminalExitEvent) => void) => () => void
  onOwnership: (cb: (event: TerminalOwnershipViewModel) => void) => () => void
  onSessionsChanged: (cb: (repoRoot: string) => void) => () => void
}

export interface RendererShellBridge {
  openSettingsWindow: (input?: { page?: SettingsPage }) => Promise<boolean>
  openExternalUrl: (input: { url: string; allowHttp?: boolean }) => Promise<ExecResult>
  openDirectoryDialog: (input?: { title?: string }) => Promise<string | null>
  openFileDialog?: (input?: { title?: string }) => Promise<string[]>
  consumeExternalOpenPaths: () => Promise<string[]>
  openInFinder: (input: { path: string }) => Promise<ExecResult>
  readClipboardImage?: () => Promise<ClipboardBinaryFilePayload | null>
  readClipboardFilePaths?: () => Promise<string[]>
  saveClipboardBinaryFiles?: (input: SaveClipboardBinaryFilesInput) => Promise<SaveClipboardBinaryFilesResult>
  writeFileTreeClipboardFile?: (input: FileTreeClipboardFilePayload) => Promise<FileTreeClipboardWriteResult>
  readFileTreeClipboardFile?: (input: FileTreeClipboardReadInput) => Promise<FileTreeClipboardReadResult>
  openDetachedFileAreaWindow?: (input: DetachedFileAreaWindowRequest) => Promise<OpenDetachedFileAreaWindowResult>
}

export interface RendererBridge {
  kind(): RendererRuntimeKind
  hasCapability(capability: RendererNativeCapability): boolean
  getBootstrap(): RendererBootstrapSnapshot
  invokeRpc(request: RpcRequest): Promise<unknown>
  abortRpc(requestId: string): Promise<boolean>
  onRpcEvent(cb: (event: RpcEvent) => void): () => void
  onEffectIntent(cb: (event: RendererEffectIntent) => void): () => void
  pathForFile(file: File): string
  shell(): RendererShellBridge | null
  terminal(): RendererTerminalBridge
}
