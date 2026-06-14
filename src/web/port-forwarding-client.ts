import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  PortForwardListResult,
  PortForwardStartResult,
  PortForwardStopForRepoResult,
  PortForwardStopResult,
} from '#/shared/port-forwarding.ts'

export async function listPortForwardSessions(repoId: string, signal?: AbortSignal): Promise<PortForwardListResult> {
  return await postServerJson('/api/port-forwarding/list', { repoId }, { signal })
}

export async function startPortForwardSession(input: object, signal?: AbortSignal): Promise<PortForwardStartResult> {
  return await postServerJson('/api/port-forwarding/start', input, { signal })
}

export async function stopPortForwardSession(id: string): Promise<PortForwardStopResult> {
  return await postServerJson('/api/port-forwarding/stop', { id })
}

export async function stopPortForwardSessionsForRepo(repoId: string): Promise<PortForwardStopForRepoResult> {
  return await postServerJson('/api/port-forwarding/stop-for-repo', { repoId })
}
