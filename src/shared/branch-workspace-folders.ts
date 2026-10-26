export type BranchWorkspaceFolderRenameResult =
  | {
      ok: true
      branchWorkspaceId: string
      previousPath: string
      path: string
      affectedRootIds?: string[]
      pathMappings?: Array<{ previousPath: string; path: string }>
      affectedRepositoryIds?: string[]
    }
  | {
      ok: false
      message: string
      branchWorkspaceId?: string
      previousPath?: string
      /** Actual location when recovery could not restore the original directory. */
      path?: string
      affectedRootIds?: string[]
      pathMappings?: Array<{ previousPath: string; path: string }>
      affectedRepositoryIds?: string[]
    }
