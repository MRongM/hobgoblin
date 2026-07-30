import type { RepoQueryInvalidationEvent } from '#/shared/repo-query-invalidation.ts'
import type {
  BranchWorkspaceOperationUpdatedEvent,
  SettingsInvalidationEvent,
  SettingsInvalidationScope,
  WorkspaceInvalidationEvent,
} from '#/shared/server-invalidation.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'

interface InvalidationSocket {
  send(data: string): unknown
  close(code?: number, reason?: string): unknown
}

const sockets = new Set<InvalidationSocket>()

function publishInvalidationPayload(payload: string): void {
  if (sockets.size === 0) return
  for (const socket of Array.from(sockets)) {
    try {
      socket.send(payload)
    } catch {
      unregisterInvalidationSocket(socket)
    }
  }
}

export function registerInvalidationSocket(ws: InvalidationSocket): void {
  sockets.add(ws)
}

export function unregisterInvalidationSocket(ws: InvalidationSocket): void {
  sockets.delete(ws)
}

export function disconnectAllInvalidationSockets(): void {
  for (const socket of Array.from(sockets)) {
    try {
      socket.close(1001, 'server shutting down')
    } catch {}
  }
  sockets.clear()
}

export function publishRepoQueryInvalidation(event: Omit<RepoQueryInvalidationEvent, 'type'>): void {
  publishInvalidationPayload(
    JSON.stringify({ type: 'repo-query-invalidated', ...event } satisfies RepoQueryInvalidationEvent),
  )
}

export function publishSettingsInvalidation(scopes: SettingsInvalidationScope[]): void {
  if (scopes.length === 0) return
  publishInvalidationPayload(
    JSON.stringify({ type: 'settings-invalidated', scopes } satisfies SettingsInvalidationEvent),
  )
}

export function publishWorkspaceInvalidation(rootId: string, sourceToken?: string): void {
  const normalizedSourceToken =
    typeof sourceToken === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sourceToken) ? sourceToken : undefined
  publishInvalidationPayload(
    JSON.stringify({
      type: 'workspace-invalidated',
      rootId,
      ...(normalizedSourceToken ? { sourceToken: normalizedSourceToken } : {}),
    } satisfies WorkspaceInvalidationEvent),
  )
}

export function publishBranchWorkspaceOperationUpdate(
  rootId: string,
  branchWorkspaceId: string,
  operation: BranchWorkspaceActiveOperation | null,
): void {
  publishInvalidationPayload(
    JSON.stringify({
      type: 'branch-workspace-operation-updated',
      rootId,
      branchWorkspaceId,
      operation,
    } satisfies BranchWorkspaceOperationUpdatedEvent),
  )
}
