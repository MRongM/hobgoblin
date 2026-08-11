import {
  git,
  gitNetworkOptions,
  gitResultWithOptions,
  NETWORK_TIMEOUT_MS,
  type GitNetworkOptions,
  type GitOptions,
} from '#/system/git/helper.ts'
import { getRemotes } from '#/system/git/remote.ts'
import {
  parseRemoteTrackingBranchInfo,
  type RemoteTrackingBranchInfo,
} from '#/shared/remote-branches.ts'
import { parseRemoteTagInput, remoteTagRefsFromLsRemote, remoteTagSortKey } from '#/shared/remote-tags.ts'
import { parseRemoteTrackingRefs } from '#/shared/worktree-create.ts'

export async function getRemoteTrackingBranches(cwd: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const output = await git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/'], { signal })
    return parseRemoteTrackingRefs(output)
  } catch {
    return []
  }
}

export async function getRemoteTrackingBranchInfo(
  cwd: string,
  signal?: AbortSignal,
): Promise<RemoteTrackingBranchInfo[]> {
  try {
    const output = await git(
      cwd,
      ['for-each-ref', '--format=%(refname:short)%00%(objectname)', 'refs/remotes/'],
      { signal },
    )
    return parseRemoteTrackingBranchInfo(output)
  } catch {
    return []
  }
}

export async function getRemoteTags(
  cwd: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<string[]> {
  try {
    const remotes = await getRemotes(cwd, signal)
    const gitOptions = remoteTagGitOptions(signal, networkOptions)
    const refs = await Promise.all(
      remotes.map(async (remote) => {
        try {
          const output = await git(cwd, ['ls-remote', '--tags', '--refs', remote.name], gitOptions)
          return remoteTagRefsFromLsRemote(remote.name, output)
        } catch {
          return []
        }
      }),
    )
    return Array.from(new Set(refs.flat())).sort((a, b) => remoteTagSortKey(a).localeCompare(remoteTagSortKey(b)))
  } catch {
    return []
  }
}

export async function deleteRemoteServerTag(
  cwd: string,
  remote: string,
  tag: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
) {
  const parsed = parseRemoteTagInput(remote, tag)
  if (!parsed) return { ok: false, message: 'error.invalid-arguments' }
  return gitResultWithOptions(
    cwd,
    gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal),
    'push',
    '--',
    parsed.remote,
    `:refs/tags/${parsed.tag}`,
  )
}

function remoteTagGitOptions(signal: AbortSignal | undefined, networkOptions: GitNetworkOptions | undefined): GitOptions {
  return networkOptions ? gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal) : { signal }
}
