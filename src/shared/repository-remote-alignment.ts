export type RepositoryRemoteAlignmentPreviewResult =
  | {
      ok: true
      token: string
      repoId: string
      branch: string
      worktreePath: string
      upstream: string
      ahead: number
      changeCount: number
    }
  | { ok: false; message: string }
