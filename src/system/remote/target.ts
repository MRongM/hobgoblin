import { normalizeRemoteTarget, type RemoteConnectionInput, type ResolvedRemoteTarget } from '#/shared/remote-repo.ts'
import { resolveUsableWindowsWslExecutable } from '#/shared/windows-wsl.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import { listWindowsWslDistributions } from '#/system/wsl/distributions.ts'

export async function resolveRepositoryRemoteTarget(
  input: RemoteConnectionInput & { transport?: 'wsl' },
  signal?: AbortSignal,
): Promise<ResolvedRemoteTarget> {
  if (input.transport !== 'wsl') return await resolveSshRemoteTarget(input, signal)
  if (signal?.aborted) throw new Error('cancelled')
  const executable = resolveUsableWindowsWslExecutable()
  if (!executable) throw new Error('error.wsl-unavailable')
  const distributions = await listWindowsWslDistributions(signal)
  if (!distributions.includes(input.alias)) throw new Error('error.wsl-distribution-unavailable')
  const target = normalizeRemoteTarget({
    transport: 'wsl',
    alias: input.alias,
    host: input.alias,
    user: 'wsl',
    port: 22,
    remotePath: input.remotePath,
    displayName: `${input.alias}:${linuxBasename(input.remotePath)}`,
    wslExecutable: executable,
  })
  if (!target) throw new Error('error.invalid-path')
  return { target }
}

function linuxBasename(value: string): string {
  const normalized = value.replace(/\/+$/u, '')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || '/'
}
