import {
  fileTreeSearchRank,
  normalizeFileTreeSearchLimit,
  sortRepoFileSearchMatches,
  type RepoFileSearchMatch,
  type RepoFileSearchResult,
} from '#/shared/file-tree.ts'
import { git } from '#/system/git/helper.ts'

const SKIPPED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', 'coverage'])

function validSearchInput(worktreePath: string, query: string): boolean {
  return worktreePath.length > 0 && !worktreePath.includes('\0') && query.trim().length > 0
}

function splitGitFilesOutput(output: string): string[] {
  return output
    .split('\0')
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasSkippedSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment))
}

function directoryPrefixes(relativePath: string): string[] {
  const parts = relativePath.split('/').filter(Boolean)
  const prefixes: string[] = []
  for (let i = 1; i < parts.length; i += 1) {
    prefixes.push(parts.slice(0, i).join('/'))
  }
  return prefixes
}

function candidateMatches(query: string, paths: string[]): RepoFileSearchMatch[] {
  const files = new Map<string, RepoFileSearchMatch>()
  const directories = new Map<string, RepoFileSearchMatch>()
  for (const relativePath of paths) {
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\0') || hasSkippedSegment(relativePath)) {
      continue
    }
    files.set(relativePath, { relativePath, kind: 'file' })
    for (const directory of directoryPrefixes(relativePath)) {
      if (!hasSkippedSegment(directory)) directories.set(directory, { relativePath: directory, kind: 'directory' })
    }
  }
  return [...directories.values(), ...files.values()].filter(
    (match) => fileTreeSearchRank(query, match.relativePath) !== null,
  )
}

export async function searchLocalFileTree(
  worktreePath: string,
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<RepoFileSearchResult> {
  if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!validSearchInput(worktreePath, query)) return { ok: false, message: 'error.invalid-arguments' }
  const limit = normalizeFileTreeSearchLimit(options.limit)
  try {
    const output = await git(worktreePath, ['ls-files', '-co', '--exclude-standard', '-z'], {
      signal: options.signal,
    })
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    const matches = sortRepoFileSearchMatches(query, candidateMatches(query, splitGitFilesOutput(output)))
    return { ok: true, matches: matches.slice(0, limit), truncated: matches.length > limit, limit }
  } catch (err) {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: err instanceof Error ? err.message : 'error.failed-read-repo' }
  }
}
