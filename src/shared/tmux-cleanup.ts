export interface TmuxSessionRecord {
  sessionName: string
  initialPath: string
  terminalNumber: number
  attachedClients: number
  /** Undefined identifies a session retained on the legacy default tmux server. */
  serverName?: string
}

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
