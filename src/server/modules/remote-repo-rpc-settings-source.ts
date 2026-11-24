import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createSecureContext } from 'node:tls'
import PQueue from 'p-queue'
import writeFileAtomic from 'write-file-atomic'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { isRepoRpcAlias, isRepoRpcToken, type RepoRpcSettings } from '#/shared/remote-repo-rpc.ts'
import { checkRepoRpcConnection, type RepoRpcConnection } from '#/system/remote/repo-rpc-client.ts'

const writes = new PQueue({ concurrency: 1 })
type SavedConnection = RepoRpcConnection & Pick<RepoRpcSettings, 'mode'> & { revision?: number }

async function loadConnections(file = serverDataFile('remote-repo-rpc.json')): Promise<SavedConnection[]> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as SavedConnection[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function publicSettings(connections: SavedConnection[]): RepoRpcSettings[] {
  return connections.map(({ alias, mode, endpoint, ca, revision = 0 }) => ({ alias, mode, endpoint, ca, revision }))
}

export async function listRepoRpcSettings(): Promise<RepoRpcSettings[]> {
  return publicSettings(await loadConnections())
}

export async function getRepoRpcConnection(alias: string): Promise<RepoRpcConnection | undefined> {
  return (await loadConnections()).find((entry) => entry.alias === alias && entry.mode === 'rpc')
}

export async function saveRepoRpcSettings(input: unknown, signal: AbortSignal): Promise<RepoRpcSettings[]> {
  const value = input as Record<string, unknown> | null
  const alias = typeof value?.alias === 'string' ? value.alias.trim() : ''
  if (
    !value ||
    !isRepoRpcAlias(alias) ||
    (value.mode !== 'ssh' && value.mode !== 'rpc') ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    throw new Error('error.invalid-arguments')
  }
  const file = serverDataFile('remote-repo-rpc.json')
  return await writes.add(
    async () => {
      const current = await loadConnections(file)
      const next = current.filter((entry) => entry.alias !== alias)
      const previous = current.find((entry) => entry.alias === alias)
      const revision = previous?.revision ?? 0
      if (value.revision !== revision) throw new Error('error.remote-rpc-settings-changed')
      if (value.mode === 'rpc') {
        const endpoint = normalizeEndpoint(value.endpoint)
        const ca = typeof value.ca === 'string' ? value.ca.trim() : ''
        const savedToken = previous?.endpoint === endpoint && previous?.ca === ca ? previous.token : undefined
        const token = typeof value.token === 'string' && value.token.trim() ? value.token.trim() : savedToken
        if (!endpoint || !isRepoRpcToken(token) || ca.length > 65_536) throw new Error('error.invalid-arguments')
        if (ca) {
          try {
            if (!/^(?:-----BEGIN CERTIFICATE-----[\sA-Za-z0-9+/=]+-----END CERTIFICATE-----\s*)+$/u.test(ca)) {
              throw new Error('Expected a PEM certificate')
            }
            createSecureContext({ ca })
          } catch {
            throw new Error('error.invalid-arguments')
          }
        }
        const connection = { alias, endpoint, ca, token }
        await checkRepoRpcConnection(connection, signal)
        next.push({ ...connection, mode: 'rpc', revision: revision + 1 })
      } else if (previous) {
        next.push({ ...previous, mode: 'ssh', revision: revision + 1 })
      } else {
        return publicSettings(current)
      }
      signal.throwIfAborted()
      await mkdir(path.dirname(file), { recursive: true })
      await writeFileAtomic(file, JSON.stringify(next), { mode: 0o600 })
      return publicSettings(next)
    },
    { signal },
  )
}

function normalizeEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return null
    return url.origin
  } catch {
    return null
  }
}
