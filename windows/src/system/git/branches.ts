import {
  git,
  gitNetworkOptions,
  gitResultWithOptions,
  NETWORK_TIMEOUT_MS,
  type GitNetworkOptions,
} from '#/system/git/helper.ts'
import { FIELD_SEP, parseBranches } from '#/system/git/parsers.ts'
import { isProtectedRemoteBranchRef, parseRemoteBranchInput } from '#/shared/remote-branches.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'
import type { BranchSnapshotInfo, ExecResult, WorktreeInfo } from '#/shared/git-types.ts'

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

export async function getRepoRoot(cwd: string, options?: { signal?: AbortSignal }): Promise<string> {
  try {
    return await git(cwd, ['rev-parse', '--show-toplevel'], { signal: options?.signal })
  } catch {
    return ''
  }
}

export async function getRepoName(cwd: string): Promise<string> {
  const root = await getRepoRoot(cwd)
  if (!root) return ''
  // git rev-parse always emits forward slashes, but a user-typed cwd may
  // contain backslashes on Windows — handle both.
  const idx = Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\'))
  return idx >= 0 ? root.slice(idx + 1) : root
}

export async function getCurrentBranch(cwd: string, options?: { signal?: AbortSignal }): Promise<string> {
  if (options?.signal?.aborted) return ''
  // `symbolic-ref` fails on detached HEAD — exactly what we want.
  // `rev-parse --abbrev-ref HEAD` would return literal "HEAD" there.
  try {
    return await git(cwd, ['symbolic-ref', '--short', 'HEAD'], { signal: options?.signal })
  } catch {
    return ''
  }
}

export async function getDefaultBranch(cwd: string, options?: { signal?: AbortSignal }): Promise<string> {
  try {
    const ref = await git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { signal: options?.signal })
    return ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref
  } catch {
    return ''
  }
}

const BRANCH_CREATED_FROM_CONFIG_SUFFIX = '.hobgoblin-created-from'
export const BRANCH_CREATED_FROM_CONFIG_PATTERN = '^branch\\..*\\.hobgoblin-created-from$'

export function branchCreatedFromConfigKey(branch: string): string {
  return `branch.${branch}${BRANCH_CREATED_FROM_CONFIG_SUFFIX}`
}

export async function recordBranchCreatedFrom(
  cwd: string,
  branch: string,
  createdFrom: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!isSafeBranchName(branch) || !isSafeBranchName(createdFrom) || signal?.aborted) return
  try {
    await git(cwd, ['config', '--local', branchCreatedFromConfigKey(branch), createdFrom], { signal })
  } catch {
    // Provenance is optional metadata; branch creation remains successful.
  }
}

export function parseBranchCreatedFromConfig(output: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of output.split('\n')) {
    const separator = line.indexOf(' ')
    if (separator <= 0) continue
    const key = line.slice(0, separator)
    const createdFrom = line.slice(separator + 1).trim()
    if (!key.startsWith('branch.') || !key.endsWith(BRANCH_CREATED_FROM_CONFIG_SUFFIX)) continue
    const branch = key.slice('branch.'.length, -BRANCH_CREATED_FROM_CONFIG_SUFFIX.length)
    if (isSafeBranchName(branch) && isSafeBranchName(createdFrom)) result.set(branch, createdFrom)
  }
  return result
}

export function markBranchCreatedFrom(
  branches: BranchSnapshotInfo[],
  createdFromByBranch: ReadonlyMap<string, string>,
): BranchSnapshotInfo[] {
  if (createdFromByBranch.size === 0) return branches
  return branches.map((branch) => {
    const createdFrom = createdFromByBranch.get(branch.name)
    return createdFrom ? { ...branch, createdFrom } : branch
  })
}

async function getBranchCreatedFromConfig(cwd: string, signal?: AbortSignal): Promise<Map<string, string>> {
  if (signal?.aborted) return new Map()
  try {
    const output = await git(cwd, ['config', '--local', '--get-regexp', BRANCH_CREATED_FROM_CONFIG_PATTERN], { signal })
    return parseBranchCreatedFromConfig(output)
  } catch {
    return new Map()
  }
}

export function prioritizeDefaultBranch(branches: BranchSnapshotInfo[], defaultBranch: string): BranchSnapshotInfo[] {
  if (!defaultBranch) return branches
  const idx = branches.findIndex((branch) => branch.name === defaultBranch)
  if (idx <= 0) return branches
  return [branches[idx]!, ...branches.slice(0, idx), ...branches.slice(idx + 1)]
}

export function markDefaultBranch(branches: BranchSnapshotInfo[], defaultBranch: string): BranchSnapshotInfo[] {
  if (!defaultBranch && !branches.some((branch) => branch.isDefault)) return branches
  return branches.map((branch) => {
    if (branch.name === defaultBranch) return branch.isDefault ? branch : { ...branch, isDefault: true }
    if (!branch.isDefault) return branch
    const { isDefault: _isDefault, ...rest } = branch
    return rest
  })
}

export async function getBranches(
  cwd: string,
  worktrees?: WorktreeInfo[],
  options?: { signal?: AbortSignal },
): Promise<BranchSnapshotInfo[]> {
  try {
    const format = [
      '%(refname:short)',
      '%(objectname:short)',
      '%(subject)',
      '%(authordate:iso-strict)',
      '%(authorname)',
      '%(upstream:short)',
      '%(upstream:track)',
    ].join(FIELD_SEP)

    const [output, currentBranch, defaultBranch, createdFromByBranch] = await Promise.all([
      git(cwd, ['for-each-ref', `--format=${format}`, 'refs/heads/'], { signal: options?.signal }),
      getCurrentBranch(cwd, { signal: options?.signal }),
      getDefaultBranch(cwd, { signal: options?.signal }),
      getBranchCreatedFromConfig(cwd, options?.signal),
    ])
    if (options?.signal?.aborted) return []
    const branches = markBranchCreatedFrom(parseBranches(output, currentBranch, worktrees), createdFromByBranch)
    return prioritizeDefaultBranch(markDefaultBranch(branches, defaultBranch), defaultBranch)
  } catch {
    return []
  }
}

export async function checkoutBranch(cwd: string, name: string, signal?: AbortSignal): Promise<ExecResult> {
  if (!isSafeBranchName(name)) return { ok: false, message: 'error.invalid-arguments' }
  return gitResultWithOptions(cwd, { signal }, 'switch', '--', name)
}

export async function createBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(branch) || !isSafeBranchName(baseBranch))
    return { ok: false, message: 'error.invalid-arguments' }
  const created = await gitResultWithOptions(cwd, { signal }, 'branch', '--', branch, baseBranch)
  if (created.ok) await recordBranchCreatedFrom(cwd, branch, baseBranch, signal)
  return created
}

export async function createTrackingBranch(
  cwd: string,
  localBranch: string,
  remoteRef: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(localBranch) || !isRemoteTrackingRef(remoteRef)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const created = await gitResultWithOptions(cwd, { signal }, 'branch', '--track', '--', localBranch, remoteRef)
  if (created.ok) await recordBranchCreatedFrom(cwd, localBranch, remoteRef, signal)
  return created
}

export async function setBranchUpstream(
  cwd: string,
  branch: string,
  remoteRef: string | null,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(branch) || (remoteRef !== null && !isRemoteTrackingRef(remoteRef))) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return remoteRef === null
    ? gitResultWithOptions(cwd, { signal }, 'branch', '--unset-upstream', '--', branch)
    : gitResultWithOptions(cwd, { signal }, 'branch', `--set-upstream-to=${remoteRef}`, '--', branch)
}

export async function deleteBranch(
  cwd: string,
  name: string,
  options?: { force?: boolean; signal?: AbortSignal },
): Promise<ExecResult> {
  if (!isSafeBranchName(name)) return { ok: false, message: 'error.invalid-arguments' }
  return gitResultWithOptions(cwd, { signal: options?.signal }, 'branch', options?.force ? '-D' : '-d', '--', name)
}

export async function deleteUpstreamBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  if (!isSafeBranchName(branch)) return { ok: false, message: 'error.invalid-arguments' }
  return gitResultWithOptions(cwd, { timeoutMs: NETWORK_TIMEOUT_MS, signal }, 'push', '--delete', '--', remote, branch)
}

export async function deleteRemoteServerBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
  const parsed = parseRemoteBranchInput(remote, branch)
  if (!parsed || isProtectedRemoteBranchRef(parsed.fullRef)) return { ok: false, message: 'error.invalid-arguments' }
  return gitResultWithOptions(
    cwd,
    gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal),
    'push',
    '--delete',
    '--',
    parsed.remote,
    parsed.branch,
  )
}

/** Resolve `branch`'s upstream short ref (e.g. "origin/feat") or null
 *  when the branch has no upstream configured. */
export async function getUpstream(cwd: string, branch: string, signal?: AbortSignal): Promise<string | null> {
  if (!isSafeBranchName(branch)) return null
  if (signal?.aborted) return null
  try {
    const out = await git(cwd, ['rev-parse', '--abbrev-ref', `${branch}@{u}`], { signal })
    return out.trim() || null
  } catch {
    return null
  }
}

/** Whether `ancestor` is reachable from `descendant` (i.e. every commit
 *  on `ancestor` is on `descendant`'s history). Mirrors the predicate
 *  `git branch -d` uses to decide if a branch is "fully merged".
 *  `descendant` may be 'HEAD', a branch name, or 'origin/foo'; we don't
 *  re-validate it because callers in this codebase pass either a fixed
 *  literal or a value just produced by git itself (getUpstream). The
 *  trailing `--` keeps either argument from being interpreted as a flag
 *  if a future caller passes user input. */
export async function isAncestor(
  cwd: string,
  ancestor: string,
  descendant: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!isSafeBranchName(ancestor)) return false
  if (signal?.aborted) return false
  try {
    await git(cwd, ['merge-base', '--is-ancestor', '--', ancestor, descendant], { signal })
    return true
  } catch {
    return false
  }
}
