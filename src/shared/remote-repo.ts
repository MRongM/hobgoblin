import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

export interface RemoteRepoRef {
  id: string
  alias: string
  remotePath: string
  displayName: string
  /** Absent means SSH for compatibility with existing saved sessions. */
  transport?: 'wsl'
}

export interface RemoteRepoTarget extends RemoteRepoRef {
  host: string
  user: string
  port: number
  wslExecutable?: string
}

export type LocalRepoSessionEntry = { kind: 'local'; id: string }
export type RemoteRepoSessionEntry = { kind: 'remote'; id: string; ref: RemoteRepoRef }
export type RepoSessionEntry = LocalRepoSessionEntry | RemoteRepoSessionEntry

export interface SshConfigHost {
  alias: string
  hostName?: string
  user?: string
  port?: number
}

export interface SshConfigHostsResult {
  hosts: SshConfigHost[]
  hasInclude: boolean
}

export type RemoteConnectionInput = { alias: string; remotePath: string }

export interface RemotePathSuggestionsInput extends RemoteConnectionInput {
  prefix: string
}

export interface ResolvedRemoteTarget {
  target: RemoteRepoTarget
}

export type RemoteDiagnosticStageName = 'ssh' | 'shell' | 'git' | 'path' | 'repo'
export type RemoteDiagnosticStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
export type RemoteDiagnosticCategory =
  | 'auth-failed'
  | 'host-key'
  | 'unreachable'
  | 'handshake-failed'
  | 'shell-failed'
  | 'git-missing'
  | 'path-missing'
  | 'not-a-repo'
  | 'timeout'
  | 'cancelled'
  | 'config-changed'
  | 'unknown'

export interface RemoteDiagnosticStage {
  name: RemoteDiagnosticStageName
  label: string
  status: RemoteDiagnosticStageStatus
  category?: RemoteDiagnosticCategory
  message?: string
  details?: string
}

export interface RemoteDiagnosticsResult {
  target: RemoteRepoTarget
  ok: boolean
  stages: RemoteDiagnosticStage[]
  category?: RemoteDiagnosticCategory
  message?: string
  details?: string
}

export interface RemoteRepoTargetInput {
  alias?: unknown
  host?: unknown
  user?: unknown
  port?: unknown
  remotePath?: unknown
  displayName?: unknown
  transport?: unknown
  wslExecutable?: unknown
}

export interface RemoteRepoRefInput {
  alias?: unknown
  remotePath?: unknown
  displayName?: unknown
  transport?: unknown
}

const REMOTE_REPO_ID_PREFIX = 'ssh-config://'
const WSL_REPO_ID_PREFIX = 'wsl://'
type RemoteRepoIdentity = Pick<RemoteRepoRef, 'alias' | 'remotePath' | 'transport'>

export function normalizeRemoteRepoId(input: RemoteRepoRefInput): string {
  const normalized = remoteRefFields(input)
  if (!normalized) throw new TypeError('Invalid remote repository reference')
  const prefix = normalized.transport === 'wsl' ? WSL_REPO_ID_PREFIX : REMOTE_REPO_ID_PREFIX
  return `${prefix}${encodeURIComponent(normalized.alias)}${encodeRemotePath(normalized.remotePath)}`
}

export function isRemoteRepoId(value: string): boolean {
  return value.startsWith(REMOTE_REPO_ID_PREFIX) || value.startsWith(WSL_REPO_ID_PREFIX)
}

export function isSshRepoId(value: string): boolean {
  return value.startsWith(REMOTE_REPO_ID_PREFIX)
}

export function isWslRepoId(value: string): boolean {
  return value.startsWith(WSL_REPO_ID_PREFIX)
}

export function normalizeRemoteRepoRef(input: RemoteRepoRefInput): RemoteRepoRef | null {
  const fields = remoteRefFields(input)
  if (!fields) return null
  const id = normalizeRemoteRepoId(fields)
  const displayName =
    typeof input.displayName === 'string' && safeText(input.displayName)
      ? input.displayName.trim()
      : remoteDisplayName(fields)
  return {
    id,
    alias: fields.alias,
    remotePath: fields.remotePath,
    displayName,
    ...(fields.transport === 'wsl' ? { transport: 'wsl' as const } : {}),
  }
}

export function normalizeRemoteTarget(input: RemoteRepoTargetInput): RemoteRepoTarget | null {
  const ref = normalizeRemoteRepoRef(input)
  const fields = remoteTargetFields(input)
  if (!ref || !fields) return null
  return {
    ...ref,
    host: fields.host,
    user: fields.user,
    port: fields.port,
    ...(ref.transport === 'wsl' && typeof input.wslExecutable === 'string'
      ? { wslExecutable: input.wslExecutable }
      : {}),
  }
}

export function remoteTargetSubtitle(target: Pick<RemoteRepoTarget, 'host' | 'user' | 'remotePath'>): string {
  return `${target.user}@${target.host}:${target.remotePath}`
}

export function remoteWorktreePathLabel(target: Pick<RemoteRepoTarget, 'host' | 'user'>, path: string): string {
  return `${target.user}@${target.host}:${path}`
}

export function remoteDisplayName(target: Pick<RemoteRepoTargetInput, 'alias' | 'host' | 'remotePath'>): string {
  const alias = typeof target.alias === 'string' && safeText(target.alias) ? target.alias.trim() : null
  const host = typeof target.host === 'string' && safeText(target.host) ? target.host.trim() : 'remote'
  const remotePath =
    typeof target.remotePath === 'string' && safeText(target.remotePath) ? normalizeRemotePath(target.remotePath) : null
  return `${alias ?? host}:${basename(remotePath ?? '/')}`
}

export function repoSessionEntryId(entry: RepoSessionEntry): string {
  return entry.id
}

export function localRepoSessionEntry(id: string): LocalRepoSessionEntry {
  return { kind: 'local', id }
}

export function remoteRepoSessionEntry(ref: RemoteRepoRef | RemoteRepoTarget): RemoteRepoSessionEntry {
  const normalized = normalizeRemoteRepoRef(ref)
  if (!normalized) throw new TypeError('Invalid remote repository reference')
  return { kind: 'remote', id: normalized.id, ref: normalized }
}

export function normalizeRepoSessionEntry(input: unknown): RepoSessionEntry | null {
  if (!input || typeof input !== 'object') return null
  const entry = input as Partial<RepoSessionEntry> & { target?: unknown; ref?: unknown }
  if (entry.kind === 'local') {
    return typeof entry.id === 'string' && safeText(entry.id) ? { kind: 'local', id: entry.id } : null
  }
  if (entry.kind === 'remote') {
    if (typeof entry.id !== 'string' || !safeText(entry.id)) return null
    const identity = parseRemoteRepoId(entry.id)
    const ref = normalizeRemoteRepoRef((entry.ref ?? entry.target) as RemoteRepoRefInput)
    if (!identity || !ref || identity.alias !== ref.alias || identity.remotePath !== ref.remotePath) return null
    const restoredRef = normalizeRemoteRepoRef({
      ...ref,
      ...identity,
    })
    return restoredRef ? { kind: 'remote', id: restoredRef.id, ref: restoredRef } : null
  }
  return null
}

export function parseRemoteRepoId(repoId: string): RemoteRepoIdentity | null {
  if (!isRemoteRepoId(repoId)) return null
  const transport = isWslRepoId(repoId) ? 'wsl' : undefined
  const prefix = transport === 'wsl' ? WSL_REPO_ID_PREFIX : REMOTE_REPO_ID_PREFIX
  const rest = repoId.slice(prefix.length)
  const pathIdx = rest.indexOf('/')
  if (pathIdx === -1) return null
  try {
    const alias = decodeURIComponent(rest.slice(0, pathIdx))
    const remotePath = decodeURIComponent(rest.slice(pathIdx).replace(/\+/g, '%20'))
    return remoteRefFields({ alias, remotePath, ...(transport === 'wsl' ? { transport } : {}) })
  } catch {
    return null
  }
}

export function remoteRepoRefFromTarget(target: RemoteRepoTarget): RemoteRepoRef {
  return {
    id: target.id,
    alias: target.alias,
    remotePath: target.remotePath,
    displayName: target.displayName,
    ...(target.transport === 'wsl' ? { transport: 'wsl' as const } : {}),
  }
}

export function remoteWorkspaceChildRef(root: RemoteRepoRef, member: string): RemoteRepoRef | null {
  const normalizedRoot = normalizeRemoteRepoRef(root)
  if (!normalizedRoot || !isWorkspaceRepositoryName(member)) return null
  const rootPath = normalizedRoot.remotePath === '/' ? '' : normalizedRoot.remotePath
  return normalizeRemoteRepoRef({
    alias: normalizedRoot.alias,
    remotePath: `${rootPath}/${member}`,
    ...(normalizedRoot.transport === 'wsl' ? { transport: 'wsl' as const } : {}),
  })
}

function remoteTargetFields(input: RemoteRepoTargetInput): Pick<RemoteRepoTarget, 'host' | 'user' | 'port'> | null {
  const host = typeof input.host === 'string' ? input.host.trim() : ''
  const user = typeof input.user === 'string' ? input.user.trim() : ''
  const port = normalizePort(input.port)
  if (!safeText(host) || !safeText(user) || port === null) return null
  return { host, user, port }
}

function remoteRefFields(input: RemoteRepoRefInput): RemoteRepoIdentity | null {
  const alias = typeof input.alias === 'string' ? input.alias.trim() : ''
  const remotePath = typeof input.remotePath === 'string' ? normalizeRemotePath(input.remotePath) : null
  if (!safeText(alias) || !remotePath) return null
  const transport = input.transport === 'wsl' ? 'wsl' : undefined
  return { alias, remotePath, ...(transport === 'wsl' ? { transport } : {}) }
}

function normalizePort(value: unknown): number | null {
  const port = value === undefined || value === null || value === '' ? 22 : value
  if (typeof port !== 'number' || !Number.isFinite(port) || !Number.isInteger(port)) return null
  return port >= 1 && port <= 65535 ? port : null
}

function normalizeRemotePath(value: string): string | null {
  const trimmed = value.trim()
  if (!safeText(trimmed) || !trimmed.startsWith('/')) return null
  const segments: string[] = []
  for (const segment of trimmed.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

function safeText(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && !/[\x00-\x1f\x7f]/.test(value)
}

function basename(remotePath: string): string {
  const trimmed = remotePath.replace(/\/+$/, '')
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || trimmed
}

function encodeRemotePath(remotePath: string): string {
  return remotePath
    .split('/')
    .map((segment, index) => (index === 0 ? '' : encodeURIComponent(segment)))
    .join('/')
}

export function isAbsoluteRemotePath(value: string): boolean {
  return value.startsWith('/') && !value.includes('\0')
}

export function isHomeRelativeRemotePath(value: string): boolean {
  return value.startsWith('~/') && !value.includes('\0')
}

export function isResolvableRemotePathInput(value: string): boolean {
  return isAbsoluteRemotePath(value) || isHomeRelativeRemotePath(value)
}
