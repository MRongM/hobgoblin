import { execa } from 'execa'
import { envForExecutable, resolveProviderExecutable } from '#/system/commit-message-ai.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import type { CreateConversation } from '#/server/modules/conversation-open-api-model.ts'

const TURN_TIMEOUT_MS = 30 * 60 * 1000
const MAX_PROVIDER_OUTPUT_BYTES = 16 * 1024 * 1024
const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export interface AgentProviderTurn {
  provider: CreateConversation['provider']
  repoId: string
  cwd: string
  prompt: string
  providerSessionId: string | null
  signal: AbortSignal
}

export type AgentProviderResult =
  | { ok: true; providerSessionId: string; reply: string }
  | { ok: false; error: 'provider_unavailable' | 'provider_failed' | 'provider_output_invalid' | 'timed_out' }

function readObject(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function decodeCodex(output: string, previousId: string | null): AgentProviderResult {
  let providerSessionId = previousId
  let reply: string | undefined
  let completed = false
  for (const line of output.split('\n')) {
    const event = readObject(line)
    if (event?.type === 'thread.started' && typeof event.thread_id === 'string') providerSessionId = event.thread_id
    if (event?.type === 'turn.completed') completed = true
    if (event?.type === 'item.completed' && event.item && typeof event.item === 'object') {
      const item = event.item as Record<string, unknown>
      if (item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) reply = item.text
    }
  }
  return completed && providerSessionId && SESSION_ID.test(providerSessionId) && reply !== undefined
    ? { ok: true, providerSessionId, reply }
    : { ok: false, error: 'provider_output_invalid' }
}

function decodeClaude(output: string): AgentProviderResult {
  const result = readObject(output)
  if (result?.is_error === true) return { ok: false, error: 'provider_failed' }
  if (
    result?.type !== 'result' ||
    typeof result.session_id !== 'string' ||
    !SESSION_ID.test(result.session_id) ||
    typeof result.result !== 'string' ||
    !result.result.trim()
  )
    return { ok: false, error: 'provider_output_invalid' }
  return { ok: true, providerSessionId: result.session_id, reply: result.result }
}

export async function runAgentProviderTurn(input: AgentProviderTurn): Promise<AgentProviderResult> {
  const { provider, providerSessionId, cwd, prompt, signal } = input
  if (providerSessionId && !SESSION_ID.test(providerSessionId)) return { ok: false, error: 'provider_output_invalid' }
  const args =
    provider === 'codex'
      ? [
          '--ask-for-approval',
          'never',
          '-c',
          'sandbox_mode="workspace-write"',
          'exec',
          ...(providerSessionId
            ? ['resume', '--json', '--skip-git-repo-check', providerSessionId]
            : ['--json', '--skip-git-repo-check']),
          '-',
        ]
      : [
          '--print',
          '--output-format',
          'json',
          '--permission-mode',
          'dontAsk',
          '--permission-prompts',
          'none',
          ...(providerSessionId ? ['--resume', providerSessionId] : []),
        ]
  const decode = (stdout: string) =>
    provider === 'codex' ? decodeCodex(stdout, providerSessionId) : decodeClaude(stdout)
  const remote = parseRemoteRepoId(input.repoId)
  if (remote) {
    const { target } = await resolveRepositoryRemoteTarget(remote, signal)
    const result = await runRemoteCommand(
      target,
      { type: 'agentCli', path: cwd, command: provider, args, inputBytes: Buffer.byteLength(prompt) },
      {
        stdin: prompt,
        signal,
        timeoutMs: TURN_TIMEOUT_MS,
        maxBuffer: MAX_PROVIDER_OUTPUT_BYTES,
      },
    )
    return result.ok ? decode(result.stdout) : { ok: false, error: result.timedOut ? 'timed_out' : 'provider_failed' }
  }
  const executable = await resolveProviderExecutable(provider, signal)
  if (!executable) return { ok: false, error: 'provider_unavailable' }
  const result = await execa(executable, args, {
    cwd,
    input: prompt,
    env: { ...envForExecutable(executable), GOBLIN_SERVER_INTERNAL_SECRET: undefined },
    cancelSignal: signal,
    timeout: TURN_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    maxBuffer: MAX_PROVIDER_OUTPUT_BYTES,
    reject: false,
  })
  return result.exitCode === 0
    ? decode(result.stdout)
    : { ok: false, error: result.timedOut ? 'timed_out' : 'provider_failed' }
}
