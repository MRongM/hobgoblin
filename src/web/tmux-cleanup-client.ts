import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  AssociatedTmuxCleanupInput,
  AssociatedTmuxTargetInput,
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
