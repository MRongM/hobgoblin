import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'

const openedAt = Date.parse('2026-01-01T00:00:00.000Z')
const expiresAt = Date.parse('2026-01-31T00:00:00.000Z')
const target = {
  workspaceId: 'workspace',
  worktreeId: 'worktree',
  repoId: '/example',
  cwd: '/example',
  provider: 'codex' as const,
}
const original = { requestId: 'first-turn', prompt: 'Original prompt' }
const followUp = { requestId: 'next-turn', prompt: 'Recent prompt' }
const sessionId = 'example-session'

let temporary: string
let file: string
let store: ReturnType<typeof createConversationOpenApiStore>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(openedAt)
  temporary = mkdtempSync(path.join(os.tmpdir(), 'hobgoblin-history-'))
  file = path.join(temporary, 'conversations.sqlite')
  store = createConversationOpenApiStore(file)
})

afterEach(() => {
  store.close()
  vi.useRealTimers()
  rmSync(temporary, { recursive: true, force: true })
})

test('removes expired messages and turns from a session with recent activity', () => {
  store.beginAgentTurn(sessionId, original, target)
  store.finishAgentTurn(sessionId, original.requestId, {
    ok: true,
    providerSessionId: 'provider-session',
    reply: 'Original reply',
  })

  vi.setSystemTime(expiresAt - 1)
  store.beginAgentTurn(sessionId, followUp)
  expect(store.listMessages(sessionId)?.map(({ content }) => content)).toEqual([
    'Original prompt',
    'Original reply',
    'Recent prompt',
  ])

  vi.setSystemTime(expiresAt)
  expect(store.getConversation(sessionId)?.messages.map(({ content }) => content)).toEqual(['Recent prompt'])
  expect(store.getAgentTurn(original.requestId)).toBeNull()
  expect(store.getAgentTurn(followUp.requestId)).toMatchObject({ state: 'working' })
  expect(store.getAgentSession(sessionId)).toMatchObject({ providerSessionId: 'provider-session' })
})

test.each(['startup', 'idle'] as const)(
  'prunes inactive history during %s cleanup without an API call',
  async (when) => {
    store.beginAgentTurn(sessionId, original, target)
    store.closeAgentSession(sessionId)
    vi.setSystemTime(expiresAt)
    if (when === 'startup') {
      store.close()
      store = createConversationOpenApiStore(file)
      await vi.advanceTimersByTimeAsync(0)
    } else {
      await vi.advanceTimersByTimeAsync(60_000)
    }

    const db = new DatabaseSync(file, { readOnly: true })
    try {
      for (const table of ['conversations', 'messages', 'agent_sessions', 'agent_turns']) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
    } finally {
      db.close()
    }
  },
)
