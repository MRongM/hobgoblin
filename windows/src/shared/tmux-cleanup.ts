export interface TmuxSessionRecord {
  sessionName: string
  initialPath: string
  terminalNumber: number
  attachedClients: number
  /** Undefined identifies a session retained on the legacy default tmux server. */
  serverName?: string
}

export interface HobgoblinTmuxHostSessionRecord extends TmuxSessionRecord {
  kind: 'hobgoblin'
}

export interface DefaultTmuxHostSessionRecord {
  kind: 'default'
  sessionName: string
  initialPath: string
  attachedClients: number
  terminalNumber?: never
  serverName?: never
}

export type TmuxHostSessionRecord = HobgoblinTmuxHostSessionRecord | DefaultTmuxHostSessionRecord

export type TmuxHostSessionIdentity =
  | {
      kind: 'hobgoblin'
      sessionName: string
      /** Undefined identifies the compatibility default tmux server. */
      serverName?: string
    }
  | {
      kind: 'default'
      sessionName: string
      serverName?: never
    }

export interface HostTmuxTargetInput {
  projectRoot: string
}

export interface HostTmuxCloseInput extends HostTmuxTargetInput {
  approvedSessions: TmuxHostSessionIdentity[]
}

export interface HostTmuxOpenInput extends HostTmuxTargetInput {
  session: TmuxHostSessionIdentity
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
      missing: TmuxHostSessionIdentity[]
      failed: HostTmuxCloseFailure[]
    }
  | { ok: false; message: string }

export type HostTmuxOpenResult = { ok: true; status: 'opened' | 'missing' } | { ok: false; message: string }

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
