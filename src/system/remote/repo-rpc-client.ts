import { createHash } from 'node:crypto'
import { connect, sensitiveHeaders, type ClientHttp2Session } from 'node:http2'
import {
  REPO_RPC_HEALTH_PATH,
  REPO_RPC_FAILURES,
  REPO_RPC_MAX_RESPONSE_BYTES,
  REPO_RPC_REPOSITORY_PATH,
  REPO_RPC_SESSION_IDLE_MS,
  REPO_RPC_VERSION,
  RepoRpcError,
  type RepoRpcFailure,
  type RepoRpcReadScope,
  type RepoRpcSettings,
  type RepoRpcSnapshot,
} from '#/shared/remote-repo-rpc.ts'

export type RepoRpcConnection = Omit<RepoRpcSettings, 'mode' | 'revision'> & { token: string }

const sessions = new Map<string, ClientHttp2Session>()

function getSession(connection: RepoRpcConnection): ClientHttp2Session {
  const ca = connection.ca.trim()
  const key = createHash('sha256')
    .update(JSON.stringify([connection.endpoint, ca]))
    .digest('hex')
  const existing = sessions.get(key)
  if (existing && !existing.closed && !existing.destroyed) return existing

  const session = connect(connection.endpoint, { rejectUnauthorized: true, ca: ca || undefined })
  sessions.set(key, session)
  session.on('error', () => undefined)
  session.on('close', () => {
    if (sessions.get(key) === session) sessions.delete(key)
  })
  session.on('goaway', () => session.close())
  session.setTimeout(REPO_RPC_SESSION_IDLE_MS, () => session.close())
  session.unref()
  return session
}

async function requestRpc(
  connection: RepoRpcConnection,
  route: string,
  body?: object,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(body ? 45_000 : 5_000)
  if (signal?.aborted) throw signal.reason
  try {
    const stream = getSession(connection).request(
      {
        ':method': body ? 'POST' : 'GET',
        ':path': route,
        authorization: `Bearer ${connection.token}`,
        [sensitiveHeaders]: ['authorization'],
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
    )
    let status = 0
    stream.once('response', (headers) => {
      status = Number(headers[':status'])
    })
    stream.end(body ? JSON.stringify(body) : undefined)
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > REPO_RPC_MAX_RESPONSE_BYTES) throw new RepoRpcError('response-too-large')
      chunks.push(bytes)
    }
    let result: unknown
    try {
      result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new RepoRpcError('protocol')
    }
    if (status !== 200) {
      const reason = (result as { reason?: RepoRpcFailure } | null)?.reason
      throw new RepoRpcError(reason && REPO_RPC_FAILURES.includes(reason) ? reason : 'protocol')
    }
    return result
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (timeout.aborted) throw new RepoRpcError('request-timeout')
    if (error instanceof RepoRpcError) throw error
    const cause = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException }
    const code = [cause.code, cause.cause?.code].join(' ')
    if (/TLS|CERT|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/u.test(code)) throw new RepoRpcError('tls')
    throw new RepoRpcError()
  }
}

export async function checkRepoRpcConnection(connection: RepoRpcConnection, signal?: AbortSignal): Promise<void> {
  const result = (await requestRpc(connection, REPO_RPC_HEALTH_PATH, undefined, signal)) as { version?: number } | null
  if (result?.version !== REPO_RPC_VERSION) throw new RepoRpcError('protocol')
}

export async function readRepoRpcSnapshot(
  connection: RepoRpcConnection,
  path: string,
  scope: RepoRpcReadScope,
  signal?: AbortSignal,
): Promise<RepoRpcSnapshot> {
  const result = (await requestRpc(
    connection,
    REPO_RPC_REPOSITORY_PATH,
    { path, scope },
    signal,
  )) as RepoRpcSnapshot | null
  if (
    !result ||
    !Array.isArray(result.worktrees) ||
    ((scope === 'snapshot' || scope === 'combined') &&
      (!Array.isArray(result.snapshot?.branches) || typeof result.snapshot.current !== 'string')) ||
    ((scope === 'status' || scope === 'combined') &&
      (!Array.isArray(result.status) ||
        result.status.some((entry) => !entry || typeof entry.path !== 'string' || !Array.isArray(entry.entries)))) ||
    (result.stalePaths !== undefined &&
      (!Array.isArray(result.stalePaths) || result.stalePaths.some((entry) => typeof entry !== 'string')))
  )
    throw new RepoRpcError('protocol')
  return result
}
