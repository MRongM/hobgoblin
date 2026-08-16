import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  AssociatedTmuxCleanupInput,
  AssociatedTmuxTargetInput,
  HostTmuxCloseInput,
  HostTmuxCloseResult,
  HostTmuxInventoryResult,
  HostTmuxOpenInput,
  HostTmuxOpenResult,
  HostTmuxTargetInput,
  TmuxCleanupPreviewResult,
  TmuxCleanupResult,
} from '#/shared/tmux-cleanup.ts'

export async function previewAssociatedTmuxSessions(
  input: AssociatedTmuxTargetInput,
  signal?: AbortSignal,
): Promise<TmuxCleanupPreviewResult> {
  return await postServerJson('/api/tmux-cleanup/preview', input, { signal })
}

export async function cleanupAssociatedTmuxSessions(
  input: AssociatedTmuxCleanupInput,
  signal?: AbortSignal,
): Promise<TmuxCleanupResult> {
  return await postServerJson('/api/tmux-cleanup/execute', input, { signal })
}

export async function previewHostTmuxSessions(
  input: HostTmuxTargetInput,
  signal?: AbortSignal,
): Promise<HostTmuxInventoryResult> {
  return await postServerJson('/api/tmux-cleanup/host-preview', input, { signal })
}

export async function closeHostTmuxSessions(
  input: HostTmuxCloseInput,
  signal?: AbortSignal,
): Promise<HostTmuxCloseResult> {
  return await postServerJson('/api/tmux-cleanup/host-execute', input, { signal })
}

export async function openHostTmuxSession(input: HostTmuxOpenInput, signal?: AbortSignal): Promise<HostTmuxOpenResult> {
  return await postServerJson('/api/tmux-cleanup/host-open', input, { signal })
}
