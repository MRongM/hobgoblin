export interface TmuxSessionRecord {
  sessionName: string
  initialPath: string
  terminalNumber: number
  attachedClients: number
  /** Undefined identifies a session retained on the legacy default tmux server. */
  serverName?: string
}

export interface TmuxHostSessionRecord extends TmuxSessionRecord {
  projectRoot: string
}

export interface TmuxSessionIdentity {
  sessionName: string
  /** Undefined identifies the compatibility default tmux server. */
  serverName?: string
}

export interface HostTmuxTargetInput {
  projectRoot: string
}

export interface HostTmuxCloseInput extends HostTmuxTargetInput {
  approvedSessions: TmuxSessionIdentity[]
}

export type HostTmuxInventoryResult = { ok: true; sessions: TmuxHostSessionRecord[] } | { ok: false; message: string }

export interface HostTmuxCloseFailure {
  session: TmuxHostSessionRecord
  message: string
}

export type HostTmuxCloseResult =
  | {
      ok: true
      closed: TmuxHostSessionRecord[]
      missing: TmuxSessionIdentity[]
      failed: HostTmuxCloseFailure[]
    }
  | { ok: false; message: string }

export interface AssociatedTmuxTargetInput {
  projectRoot: string
  itemPath: string
}

export interface AssociatedTmuxCleanupInput extends AssociatedTmuxTargetInput {
  approvedSessionNames: string[]
}

export type TmuxCleanupPreviewResult =
  | { ok: true; targetPath: string; sessions: TmuxSessionRecord[] }
  | { ok: false; message: string }

export interface TmuxCleanupFailure {
  sessionName: string
  message: string
}

export type TmuxCleanupResult =
  | {
      ok: true
      targetPath: string
      deleted: TmuxSessionRecord[]
      missingSessionNames: string[]
      failed: TmuxCleanupFailure[]
    }
  | { ok: false; message: string }
