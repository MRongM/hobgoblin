import { expect, test, vi } from 'vitest'
import { runAgentProviderTurn } from '#/server/modules/agent-open-api-provider.ts'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  resolveProviderExecutable: vi.fn(),
  runRemoteCommand: vi.fn(),
  resolveRepositoryRemoteTarget: vi.fn(),
}))
vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('#/system/commit-message-ai.ts', () => ({
  resolveProviderExecutable: mocks.resolveProviderExecutable,
  envForExecutable: () => undefined,
}))
vi.mock('#/system/remote/target.ts', () => ({ resolveRepositoryRemoteTarget: mocks.resolveRepositoryRemoteTarget }))
vi.mock('#/system/ssh/commands.ts', () => ({ runRemoteCommand: mocks.runRemoteCommand }))

const providerSessionId = 'e6524476-f3b5-43ef-b14b-d4c9deafb858'
const prompt = 'Example with a shell-like string $(echo should-be-text)'

test('reads the final complete Codex reply and passes input on stdin', async () => {
  mocks.resolveProviderExecutable.mockResolvedValue('/example/bin/codex')
  const events = [
    { type: 'thread.started', thread_id: providerSessionId },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Working on it' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Complete result\n\nDetails' } },
    { type: 'turn.completed' },
  ]
  mocks.execa.mockResolvedValue({ exitCode: 0, stdout: events.map((event) => JSON.stringify(event)).join('\n') })
  const signal = new AbortController().signal
  const result = await runAgentProviderTurn({
    provider: 'codex',
    providerSessionId,
    repoId: '/example',
    cwd: '/example',
    prompt,
    signal,
  })
  expect(result).toEqual({ ok: true, providerSessionId, reply: 'Complete result\n\nDetails' })
  expect(mocks.execa).toHaveBeenCalledWith(
    '/example/bin/codex',
    expect.arrayContaining(['resume', providerSessionId, '-']),
    expect.objectContaining({ input: prompt, cwd: '/example', cancelSignal: signal }),
  )
})

test('resumes Claude on the workspace host and reads its structured complete result', async () => {
  const target = { alias: 'development', remotePath: '/workspace' }
  mocks.resolveRepositoryRemoteTarget.mockResolvedValue({ target })
  mocks.runRemoteCommand.mockResolvedValue({
    ok: true,
    stdout: JSON.stringify({
      type: 'result',
      is_error: false,
      session_id: providerSessionId,
      result: 'Claude finished',
    }),
  })
  const result = await runAgentProviderTurn({
    provider: 'claude',
    providerSessionId,
    repoId: 'ssh-config://development/workspace',
    cwd: '/workspace',
    prompt,
    signal: new AbortController().signal,
  })
  expect(result).toEqual({ ok: true, providerSessionId, reply: 'Claude finished' })
  expect(mocks.runRemoteCommand).toHaveBeenCalledWith(
    target,
    {
      type: 'agentCli',
      path: '/workspace',
      command: 'claude',
      inputBytes: Buffer.byteLength(prompt),
      args: expect.arrayContaining(['--resume', providerSessionId]),
    },
    expect.objectContaining({ stdin: prompt }),
  )
  expect(mocks.execa).not.toHaveBeenCalled()
})
