import { toast } from 'sonner'
import type { BranchWorkspaceRepositoryFetchResult } from '#/web/branch-workspace-repository-fetch.ts'
import type { useT } from '#/web/stores/i18n.ts'

type Translator = ReturnType<typeof useT>

export function showWorkspaceRepositoryFetchResult(t: Translator, summary: BranchWorkspaceRepositoryFetchResult): void {
  if (summary.failures.length === 0) {
    toast.success(t('workspace.branch-workspace.fetch-all-success'))
    return
  }

  toast.warning(
    t('workspace.branch-workspace.fetch-all-incomplete', {
      completed: summary.succeeded,
      total: summary.total,
    }),
    {
      description: summary.failures.map((failure) => `${failure.repositoryName}: ${t(failure.message)}`).join('\n'),
    },
  )
}

export function showWorkspaceRepositoryFetchError(t: Translator, total: number, error: unknown): void {
  toast.warning(t('workspace.branch-workspace.fetch-all-incomplete', { completed: 0, total }), {
    description: error instanceof Error ? error.message : String(error),
  })
}
