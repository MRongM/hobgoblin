export interface TmuxSessionRecord {
  sessionId: string
  sessionName: string
  sessionPath: string
}

export interface AssociatedTmuxTargetInput {
  projectRoot: string
  itemPath: string
}

export interface AssociatedTmuxCleanupInput extends AssociatedTmuxTargetInput {
  approvedSessionIds: string[]
}

export type TmuxCleanupPreviewResult =
  | { ok: true; targetPath: string; sessions: TmuxSessionRecord[] }
  | { ok: false; message: string }

export interface TmuxCleanupFailure {
  sessionId: string
  sessionName: string
  message: string
}

export type TmuxCleanupResult =
  | {
      ok: true
      targetPath: string
      deleted: TmuxSessionRecord[]
      missingSessionIds: string[]
      failed: TmuxCleanupFailure[]
    }
  | { ok: false; message: string }

export function isValidTmuxSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^\$[0-9]+$/u.test(value)
}
