import { timingSafeEqual } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { createSecureServer, type ServerHttp2Stream } from 'node:http2'
import path from 'node:path'
import PQueue from 'p-queue'
import type { WorktreeInfo, WorktreeStatus } from '#/shared/git-types.ts'
import {
  REPO_RPC_HEALTH_PATH,
  REPO_RPC_MAX_RESPONSE_BYTES,
  REPO_RPC_REPOSITORY_PATH,
  REPO_RPC_SESSION_IDLE_MS,
  REPO_RPC_VERSION,
  RepoRpcError,
  type RepoRpcFailure,
  type RepoRpcReadScope,
  type RepoRpcSnapshot,
} from '#/shared/remote-repo-rpc.ts'
import { getBranches, getCurrentBranch } from '#/system/git/branches.ts'
import { mapWithConcurrency } from '#/system/git/concurrency.ts'
import { git } from '#/system/git/helper.ts'
import { parseStatus } from '#/system/git/parsers.ts'
import { getRemoteInfo } from '#/system/git/remote.ts'
import { getWorktrees } from '#/system/git/worktrees.ts'

interface ReadMetric {
  scope: RepoRpcReadScope
  queueMs: number
  scanMs: number
  staleWorktrees?: number
  failure?: RepoRpcFailure
}

interface QueuedRead {
  controller: AbortController
  result: Promise<RepoRpcSnapshot>
  readers: number
}

export function createRepoRpcAgent(options: {
  key: Buffer
  cert: Buffer
  token: string
  roots: string[]
  recordRead?: (metric: ReadMetric) => void
}) {
  const queue = new PQueue({ concurrency: 2 })
  const waiting = new Map<string, QueuedRead>()
  const tokenHeader = Buffer.from(`Bearer ${options.token}`)
  const server = createSecureServer({ key: options.key, cert: options.cert, settings: { maxConcurrentStreams: 32 } })
  server.on('session', (session) => {
    session.on('error', () => undefined)
    session.setTimeout(REPO_RPC_SESSION_IDLE_MS, () => session.destroy())
  })
  server.on('stream', (rawStream, headers) => {
    const stream = rawStream as ServerHttp2Stream
    stream.on('error', () => undefined)
    const authorization = Buffer.from(headers.authorization ?? '')
    if (authorization.length !== tokenHeader.length || !timingSafeEqual(authorization, tokenHeader)) {
      reply(stream, 401, { reason: 'authentication' })
      return
    }
    if (headers[':method'] === 'GET' && headers[':path'] === REPO_RPC_HEALTH_PATH) {
      reply(stream, 200, { version: REPO_RPC_VERSION })
      return
    }
    if (headers[':method'] !== 'POST' || headers[':path'] !== REPO_RPC_REPOSITORY_PATH) {
      reply(stream, 404)
      return
    }
    stream.setTimeout(45_000, () => stream.close())
    void serveRepository(stream).catch((error) => {
      const reason = error instanceof RepoRpcError ? error.reason : 'scan'
      const status = reason === 'directory' ? 404 : reason === 'queue-full' ? 429 : 503
      reply(stream, status, { reason })
    })
  })
  return server

  async function serveRepository(stream: ServerHttp2Stream): Promise<void> {
    const request = await readRequest(stream)
    if (!request) return reply(stream, 400, { reason: 'protocol' })
    const repository = await realpath(request.path).catch(() => null)
    if (stream.closed || stream.destroyed) return
    if (!repository || !isAllowed(options.roots, repository)) throw new RepoRpcError('directory')
    const key = JSON.stringify([repository, request.scope])
    const read = waiting.get(key) ?? queueRead(key, repository, request.scope)
    read.readers += 1
    const disconnect = () => {
      read.readers -= 1
      if (read.readers === 0) read.controller.abort(new RepoRpcError('cancelled'))
    }
    stream.once('close', disconnect)
    try {
      reply(stream, 200, await read.result)
    } finally {
      stream.removeListener('close', disconnect)
    }
  }

  function queueRead(key: string, repository: string, scope: RepoRpcReadScope): QueuedRead {
    if (queue.size >= 32) {
      options.recordRead?.({ scope, queueMs: 0, scanMs: 0, failure: 'queue-full' })
      throw new RepoRpcError('queue-full')
    }
    const controller = new AbortController()
    const startedWaitingAt = performance.now()
    let startedReadingAt: number | undefined
    const queueTimeout = setTimeout(() => controller.abort(new RepoRpcError('queue-timeout')), 10_000)
    queueTimeout.unref()
    // Let the job enter the waiting map before PQueue can start it synchronously.
    const result = Promise.resolve().then(() =>
      queue.add(
        async () => {
          waiting.delete(key)
          clearTimeout(queueTimeout)
          startedReadingAt = performance.now()
          const timeout = AbortSignal.timeout(30_000)
          const signal = AbortSignal.any([controller.signal, timeout])
          try {
            return await readRepository(repository, options.roots, scope, signal)
          } catch (error) {
            if (timeout.aborted) throw new RepoRpcError('scan-timeout')
            throw error
          }
        },
        { signal: controller.signal },
      ),
    )
    const read: QueuedRead = { controller, result, readers: 0 }
    waiting.set(key, read)
    function record(failure?: RepoRpcFailure, staleWorktrees?: number) {
      clearTimeout(queueTimeout)
      if (waiting.get(key) === read) waiting.delete(key)
      const now = performance.now()
      options.recordRead?.({
        scope,
        queueMs: Math.round((startedReadingAt ?? now) - startedWaitingAt),
        scanMs: startedReadingAt === undefined ? 0 : Math.round(now - startedReadingAt),
        ...(failure ? { failure } : { staleWorktrees }),
      })
    }
    read.result = result.then(
      (snapshot) => {
        record(undefined, snapshot.stalePaths?.length ?? 0)
        return snapshot
      },
      (error: unknown) => {
        const cause = controller.signal.aborted ? controller.signal.reason : error
        const failure = cause instanceof RepoRpcError ? cause : new RepoRpcError('scan')
        record(failure.reason)
        throw failure
      },
    )
    return read
  }
}

function containsPath(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function isAllowed(roots: string[], directory: string): boolean {
  return roots.some((root) => containsPath(root, directory))
}

async function allowedWorktree(info: WorktreeInfo, roots: string[]) {
  if (!path.isAbsolute(info.path) || !isAllowed(roots, info.path)) return null
  const directory = await realpath(info.path).catch(() => null)
  if (directory) return isAllowed(roots, directory) ? { info, directory } : null
  // An offline worktree can be reported without probing an unresolved symlink.
  const entry = await lstat(info.path).catch(() => null)
  if (entry?.isSymbolicLink()) return null
  const parent = await realpath(path.dirname(info.path)).catch(() => null)
  return parent && isAllowed(roots, parent) ? { info, directory: null } : null
}

async function readRepository(
  cwd: string,
  roots: string[],
  scope: RepoRpcReadScope,
  signal: AbortSignal,
): Promise<RepoRpcSnapshot> {
  const allWorktrees = await getWorktrees(cwd, { includeStatus: false, signal, throwOnError: true })
  const allowed = (
    await mapWithConcurrency(allWorktrees, 8, (info) => allowedWorktree(info, roots), { signal, abort: 'throw' })
  ).filter((entry) => entry !== null)
  if (!allowed.some(({ directory }) => directory !== null && containsPath(directory, cwd)))
    throw new RepoRpcError('directory')
  const worktrees = allowed.map(({ info }) => info)
  if (scope === 'worktrees') return { worktrees }

  const includeDetails = scope === 'combined' || scope === 'status'
  const stalePaths: string[] = []
  let remainingStatusBytes = REPO_RPC_MAX_RESPONSE_BYTES / 2
  const status = (
    await mapWithConcurrency(
      allowed,
      2,
      async ({ info, directory }): Promise<WorktreeStatus | undefined> => {
        if (info.isBare || info.isPrunable) return
        try {
          if (!directory) throw new Error('Worktree unavailable')
          const output = await git(directory, ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '-z'], {
            signal,
            env: { GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' },
          })
          const entries = parseStatus(output)
          info.isDirty = entries.length > 0
          info.changeCount = entries.length
          if (!includeDetails) return
          const details = { path: info.path, head: info.head, branch: info.branch, isMain: info.isPrimary, entries }
          const bytes = Buffer.byteLength(JSON.stringify(details)) + 1
          if (bytes <= remainingStatusBytes) {
            remainingStatusBytes -= bytes
            return details
          }
        } catch {
          signal.throwIfAborted()
        }
        stalePaths.push(info.path)
      },
      { signal, abort: 'throw' },
    )
  ).filter((entry) => entry !== undefined)
  const details = { ...(includeDetails ? { status } : {}), ...(stalePaths.length ? { stalePaths } : {}) }
  if (scope === 'status') return { worktrees: [], ...details }
  const [branches, current, remote] = await Promise.all([
    getBranches(cwd, worktrees, { signal, throwOnError: true }),
    getCurrentBranch(cwd, { signal }),
    getRemoteInfo(cwd, signal),
  ])
  signal.throwIfAborted()
  return { snapshot: { branches, current, remote }, worktrees: [], ...details }
}

async function readRequest(stream: ServerHttp2Stream): Promise<{ path: string; scope: RepoRpcReadScope } | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > 8192) {
      stream.close()
      return null
    }
    chunks.push(bytes)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (
      typeof value?.path === 'string' &&
      path.isAbsolute(value.path) &&
      !value.path.includes('\0') &&
      (value.scope === 'snapshot' ||
        value.scope === 'combined' ||
        value.scope === 'status' ||
        value.scope === 'worktrees')
    )
      return { path: value.path, scope: value.scope }
  } catch {}
  return null
}

function reply(stream: ServerHttp2Stream, status: number, value: unknown = null): void {
  if (stream.destroyed || stream.closed || stream.headersSent) return
  const body = JSON.stringify(value)
  if (Buffer.byteLength(body) > REPO_RPC_MAX_RESPONSE_BYTES) return reply(stream, 413, { reason: 'response-too-large' })
  stream.respond({ ':status': status, 'content-type': 'application/json', 'cache-control': 'no-store' })
  stream.end(body)
}
