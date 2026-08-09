import { createHash } from 'node:crypto'
import path from 'node:path'
import type { StatusEntry, WorktreeStatus } from '#/shared/git-types.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export function findRepositoryStatus(
  repoId: string,
  statuses: WorktreeStatus[],
  worktreePath: string,
): WorktreeStatus | undefined {
  const expected = normalizeRepositoryPath(repoId, worktreePath)
  return statuses.find((status) => normalizeRepositoryPath(repoId, status.path) === expected)
}

export function normalizeRepositoryPath(repoId: string, value: string): string {
  return isRemoteRepoId(repoId) ? path.posix.normalize(value) : path.resolve(value)
}

export function normalizedStatusEntries(entries: StatusEntry[]): StatusEntry[] {
  return entries
    .map((entry) => ({
      x: entry.x,
      y: entry.y,
      path: entry.path,
      ...(entry.originalPath ? { originalPath: entry.originalPath } : {}),
    }))
    .sort((left, right) =>
      `${left.path}\0${left.originalPath ?? ''}\0${left.x}${left.y}`.localeCompare(
        `${right.path}\0${right.originalPath ?? ''}\0${right.x}${right.y}`,
      ),
    )
}

export function repositoryPlanFingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`
}
