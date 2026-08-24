import type { ExecResult } from '#/web/types.ts'

export interface BranchWorkspaceRepositoryFetchTarget {
  id: string
  name: string
}

export interface BranchWorkspaceRepositoryFetchFailure {
  repositoryName: string
  message: string
}

export interface BranchWorkspaceRepositoryFetchResult {
  total: number
  succeeded: number
  failures: BranchWorkspaceRepositoryFetchFailure[]
}

export async function fetchBranchWorkspaceRepositories(
  targets: BranchWorkspaceRepositoryFetchTarget[],
  syncRepository: (target: BranchWorkspaceRepositoryFetchTarget) => Promise<ExecResult | null>,
): Promise<BranchWorkspaceRepositoryFetchResult> {
  const settled = await Promise.allSettled(
    targets.map(async (target) => ({
      target,
      result: (await syncRepository(target)) ?? {
        ok: false as const,
        message: 'error.network-op-in-progress',
      },
    })),
  )
  const failures = settled.flatMap<BranchWorkspaceRepositoryFetchFailure>((outcome, index) => {
    if (outcome.status === 'rejected') {
      const reason = outcome.reason
      return [
        {
          repositoryName: targets[index]!.name,
          message: reason instanceof Error ? reason.message : String(reason),
        },
      ]
    }
    if (outcome.value.result.ok) return []
    return [
      {
        repositoryName: outcome.value.target.name,
        message: outcome.value.result.message,
      },
    ]
  })

  return {
    total: targets.length,
    succeeded: targets.length - failures.length,
    failures,
  }
}
