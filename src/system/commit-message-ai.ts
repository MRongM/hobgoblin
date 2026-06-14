import { execa } from 'execa'
import { access, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  CommitMessageGenerationResult,
  CommitMessageProvider,
  CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'

const PROBE_TIMEOUT_MS = 5_000
const GENERATION_TIMEOUT_MS = 60_000
const MAX_OUTPUT_LENGTH = 2_000
const MAX_DIFF_PROMPT_LENGTH = 120_000

type ProviderOutputMode = 'text' | 'codex-jsonl'

interface ProviderCommand {
  command: string
  args: (prompt: string) => string[]
  input?: (prompt: string) => string
  outputMode: ProviderOutputMode
}

const PROVIDER_COMMANDS: Record<CommitMessageProvider, ProviderCommand> = {
  codex: {
    command: 'codex',
    args: (prompt) => ['exec', '--json', prompt],
    outputMode: 'codex-jsonl',
  },
  claude: {
    command: 'claude',
    args: () => ['--print', '--output-format', 'text', '--tools', '', '--no-session-persistence'],
    input: (prompt) => prompt,
    outputMode: 'text',
  },
}

interface GenerateCommitMessageOptions {
  cwd?: string
  signal?: AbortSignal
}

export async function probeCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability> {
  const codex = (await resolveProviderExecutable('codex', signal)) !== null
  const claude = (await resolveProviderExecutable('claude', signal)) !== null
  return { codex, claude }
}

export async function generateCommitMessageFromPatch(
  provider: CommitMessageProvider,
  patch: string,
  options?: GenerateCommitMessageOptions,
): Promise<CommitMessageGenerationResult> {
  if (!patch.trim()) return { ok: false, message: 'error.commit-message-empty-patch' }

  const command = PROVIDER_COMMANDS[provider]
  const prompt = buildCommitMessagePrompt(patch)

  try {
    const result = await runGenerationCommand(command.command, command.args(prompt), command.input?.(prompt), options)
    if (isCommandNotFound(result)) return await generateWithResolvedExecutable(provider, command, prompt, options)
    return mapGenerationResult(result, command.outputMode, options?.signal)
  } catch (err) {
    if (isCommandNotFound(err)) {
      return await generateWithResolvedExecutable(provider, command, prompt, options)
    }
    return mapGenerationError(err, options?.signal)
  }
}

async function generateWithResolvedExecutable(
  provider: CommitMessageProvider,
  command: ProviderCommand,
  prompt: string,
  options?: GenerateCommitMessageOptions,
): Promise<CommitMessageGenerationResult> {
  const executable = await resolveProviderExecutable(provider, options?.signal, { skipDirect: true })
  if (!executable) return { ok: false, message: 'error.commit-message-provider-unavailable' }
  try {
    return mapGenerationResult(
      await runGenerationCommand(executable, command.args(prompt), command.input?.(prompt), options),
      command.outputMode,
      options?.signal,
    )
  } catch (err) {
    return mapGenerationError(err, options?.signal)
  }
}

async function runGenerationCommand(
  executable: string,
  args: string[],
  input: string | undefined,
  options?: GenerateCommitMessageOptions,
) {
  const env = envForExecutable(executable)
  return await execa(executable, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
    ...(env ? { env } : {}),
    ...(input !== undefined ? { input } : {}),
    ...(input === undefined ? { stdin: 'ignore' as const } : {}),
    timeout: GENERATION_TIMEOUT_MS,
    cancelSignal: options?.signal,
    forceKillAfterDelay: 500,
    maxBuffer: 10 * 1024 * 1024,
    reject: false,
  })
}

function mapGenerationResult(
  result: Awaited<ReturnType<typeof runGenerationCommand>>,
  outputMode: ProviderOutputMode,
  signal?: AbortSignal,
): CommitMessageGenerationResult {
  if (signal?.aborted || result.isCanceled) return { ok: false, message: 'cancelled' }
  if (result.timedOut) return { ok: false, message: 'error.commit-message-timeout' }
  if (result.exitCode !== 0) {
    const failure = `${result.stderr ?? ''}`.trim() || `${result.stdout ?? ''}`.trim()
    return { ok: false, message: failure || 'error.commit-message-failed' }
  }

  const message =
    outputMode === 'codex-jsonl'
      ? parseCodexJsonlMessage(result.stdout)
      : normalizeProviderOutput(result.stdout)
  if (!message) return { ok: false, message: 'error.commit-message-empty-output' }
  return { ok: true, message }
}

function mapGenerationError(err: unknown, signal?: AbortSignal): CommitMessageGenerationResult {
  if (signal?.aborted || hasTruthyProperty(err, 'isCanceled')) return { ok: false, message: 'cancelled' }
  if (hasTruthyProperty(err, 'timedOut')) return { ok: false, message: 'error.commit-message-timeout' }
  return { ok: false, message: err instanceof Error && err.message ? err.message : 'error.commit-message-failed' }
}

async function resolveProviderExecutable(
  provider: CommitMessageProvider,
  signal?: AbortSignal,
  options?: { skipDirect?: boolean },
): Promise<string | null> {
  const command = PROVIDER_COMMANDS[provider].command
  if (!options?.skipDirect && await isCommandAvailable(command, signal)) return command

  const shellResolved = await resolveCommandFromLoginShell(command, signal)
  if (shellResolved && await isCommandAvailable(shellResolved, signal)) return shellResolved

  for (const candidate of await getCandidateExecutables(command)) {
    if (signal?.aborted) return null
    if (await candidateExists(candidate) && await isCommandAvailable(candidate, signal)) return candidate
  }

  return null
}

async function isCommandAvailable(executable: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const env = envForExecutable(executable)
    const result = await execa(executable, ['--version'], {
      ...(env ? { env } : {}),
      timeout: PROBE_TIMEOUT_MS,
      cancelSignal: signal,
      forceKillAfterDelay: 500,
      reject: false,
    })
    return result.exitCode === 0 && !result.isCanceled
  } catch {
    return false
  }
}

async function resolveCommandFromLoginShell(command: string, signal?: AbortSignal): Promise<string | null> {
  const shell = process.env.SHELL && path.isAbsolute(process.env.SHELL) ? process.env.SHELL : '/bin/zsh'
  try {
    const result = await execa(shell, ['-lc', `command -v ${command}`], {
      timeout: PROBE_TIMEOUT_MS,
      cancelSignal: signal,
      forceKillAfterDelay: 500,
      reject: false,
    })
    if (signal?.aborted || result.isCanceled || result.exitCode !== 0) return null
    return normalizeExecutablePath(result.stdout)
  } catch {
    return null
  }
}

async function getCandidateExecutables(command: string): Promise<string[]> {
  const home = os.homedir()
  const candidates = [
    path.join(home, '.local/bin', command),
    path.join(home, '.bun/bin', command),
    path.join(home, '.cargo/bin', command),
    path.join(home, '.asdf/shims', command),
    path.join(home, '.nodenv/shims', command),
    path.join('/opt/homebrew/bin', command),
    path.join('/usr/local/bin', command),
    path.join('/usr/bin', command),
    path.join('/bin', command),
    ...(await getNvmNodeExecutables(home, command)),
  ]
  return [...new Set(candidates)]
}

async function getNvmNodeExecutables(home: string, command: string): Promise<string[]> {
  try {
    const versionsDir = path.join(home, '.nvm/versions/node')
    const entries = await readdir(versionsDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(versionsDir, entry.name, 'bin', command))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

async function candidateExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

function normalizeExecutablePath(output: string): string | null {
  const executable = output.trim().split(/\r?\n/, 1)[0]?.trim()
  if (!executable || executable.includes('\0') || !path.isAbsolute(executable)) return null
  return executable
}

function envForExecutable(executable: string): { PATH: string } | undefined {
  if (!path.isAbsolute(executable)) return undefined
  const executableDir = path.dirname(executable)
  const currentPath = process.env.PATH ?? ''
  return { PATH: currentPath ? `${executableDir}${path.delimiter}${currentPath}` : executableDir }
}

function buildCommitMessagePrompt(patch: string): string {
  const readablePatch = preparePatchForPrompt(patch)
  return [
    'Write a concise Git commit message for the following uncommitted diff.',
    'Return only the commit message.',
    'Use Conventional Commits style when it fits the change.',
    'Use a short subject line and add a body only when it clarifies important details.',
    '',
    'Diff:',
    readablePatch,
  ].join('\n')
}

function preparePatchForPrompt(patch: string): string {
  const withoutBinaryPayloads = omitBinaryPatchPayloads(patch.trim())
  if (withoutBinaryPayloads.length <= MAX_DIFF_PROMPT_LENGTH) return withoutBinaryPayloads
  return `${withoutBinaryPayloads.slice(0, MAX_DIFF_PROMPT_LENGTH).trimEnd()}\n\n[diff truncated for commit message generation]`
}

function omitBinaryPatchPayloads(patch: string): string {
  const output: string[] = []
  let inBinaryPayload = false
  let currentPath = ''

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      inBinaryPayload = false
      currentPath = parseDiffTargetPath(line)
      output.push(line)
      continue
    }

    if (line === 'GIT binary patch') {
      output.push(line)
      output.push(currentPath ? `[binary diff omitted: ${currentPath}]` : '[binary diff omitted]')
      inBinaryPayload = true
      continue
    }

    if (inBinaryPayload) continue

    if (/^Binary files .+ differ$/.test(line)) {
      output.push(currentPath ? `[binary files differ omitted: ${currentPath}]` : '[binary files differ omitted]')
      continue
    }

    output.push(line)
  }

  return output.join('\n').trim()
}

function parseDiffTargetPath(line: string): string {
  const marker = ' b/'
  const index = line.indexOf(marker)
  return index >= 0 ? line.slice(index + marker.length).trim() : ''
}

function normalizeProviderOutput(output: string): string {
  let message = output.trim()
  message = message.replace(/^```(?:[a-zA-Z0-9_-]+)?\s*/, '').replace(/\s*```$/, '').trim()
  message = message.replace(/^commit message\s*:\s*/i, '').trim()
  message = message.replace(/^["'`]+|["'`]+$/g, '').trim()
  return message.slice(0, MAX_OUTPUT_LENGTH).trim()
}

function parseCodexJsonlMessage(output: string): string {
  let lastMessage = ''
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (!isCodexAgentMessageEvent(parsed)) continue
    const text = parsed.item.text.trim()
    if (text) lastMessage = text
  }
  return normalizeProviderOutput(lastMessage)
}

function isCodexAgentMessageEvent(
  value: unknown,
): value is { type: 'item.completed'; item: { type: 'agent_message'; text: string } } {
  if (typeof value !== 'object' || value === null) return false
  const event = value as { type?: unknown; item?: unknown }
  if (event.type !== 'item.completed') return false
  if (typeof event.item !== 'object' || event.item === null) return false
  const item = event.item as { type?: unknown; text?: unknown }
  return item.type === 'agent_message' && typeof item.text === 'string'
}

function hasTruthyProperty(value: unknown, property: string): boolean {
  return typeof value === 'object' && value !== null && Boolean((value as Record<string, unknown>)[property])
}

function isCommandNotFound(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { code?: unknown }).code === 'ENOENT'
}
