import { createInterface } from 'node:readline'
import { realpath } from 'node:fs/promises'
import { execa } from 'execa'
import * as v from 'valibot'
import { envForExecutable, resolveProviderExecutable } from '#/system/commit-message-ai.ts'

const threadSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  cwd: v.string(),
  name: v.nullish(v.string()),
  preview: v.string(),
  path: v.nullish(v.string()),
  updatedAt: v.number(),
})
const turnPageSchema = v.object({
  nextCursor: v.nullable(v.string()),
  data: v.array(
    v.object({
      id: v.string(),
      status: v.string(),
      startedAt: v.nullish(v.number()),
      completedAt: v.nullish(v.number()),
      items: v.array(v.looseObject({ type: v.string() })),
    }),
  ),
})
const textInput = v.object({ type: v.literal('text'), text: v.string() })
const userMessage = v.object({ type: v.literal('userMessage'), content: v.array(v.unknown()) })
const agentMessage = v.object({ type: v.literal('agentMessage'), text: v.string() })

export interface CodexHistoryTurn {
  id: string
  prompt: string
  reply: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  state?: 'completed' | 'failed' | 'cancelled'
  startedAt?: number
  completedAt?: number
}

type CodexThread = v.InferOutput<typeof threadSchema>
type CodexTurnPage = v.InferOutput<typeof turnPageSchema>
type Request = (method: string, params: object) => Promise<unknown>

async function withCodexSessionReader<T>(
  cwd: string,
  signal: AbortSignal,
  use: (request: Request) => Promise<T>,
): Promise<T> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
  const executable = await resolveProviderExecutable('codex', deadline)
  if (!executable) throw new Error('Codex is unavailable')
  const process = execa(executable, ['app-server', '--listen', 'stdio://', '--disable', 'hooks'], {
    cwd,
    env: envForExecutable(executable),
    cancelSignal: deadline,
    reject: false,
    stdout: 'pipe',
    stderr: 'ignore',
    stdin: 'pipe',
    buffer: false,
  })
  const output = createInterface({ input: process.stdout! })
  const lines = output[Symbol.asyncIterator]()
  let requestId = 0
  const send = (value: object) => process.stdin!.write(JSON.stringify(value) + '\n')
  async function request(method: string, params: object): Promise<unknown> {
    const id = ++requestId
    send({ id, method, params })
    while (true) {
      const line = await lines.next()
      if (line.done) throw new Error('Codex history reader stopped')
      const response = JSON.parse(line.value) as { id?: number; result?: unknown; error?: unknown }
      if (response.id !== id) continue
      if (response.error) throw new Error('Codex could not read the session history')
      return response.result
    }
  }
  try {
    await request('initialize', { clientInfo: { name: 'hobgoblin', title: 'Hobgoblin', version: '1.0.0' } })
    send({ method: 'initialized' })
    return await use(request)
  } finally {
    output.close()
    process.stdin!.end()
    process.kill()
    await process
  }
}

export const codexSessionHistory = {
  async list(cwd: string, signal: AbortSignal): Promise<CodexThread[]> {
    return await withCodexSessionReader(cwd, signal, async (request) => {
      const result = await request('thread/list', {
        cwd,
        limit: 30,
        sortKey: 'updated_at',
        sourceKinds: ['cli', 'vscode', 'exec'],
      })
      return v.parse(v.object({ data: v.array(threadSchema) }), result).data
    })
  },

  async listNative(cwds: string[], cutoff: number, signal: AbortSignal): Promise<CodexThread[]> {
    if (!cwds.length) return []
    return await withCodexSessionReader(cwds[0]!, signal, async (request) => {
      const threads: CodexThread[] = []
      let cursor: string | null = null
      do {
        const page: { data: CodexThread[]; nextCursor: string | null } = v.parse(
          v.object({ data: v.array(threadSchema), nextCursor: v.nullable(v.string()) }),
          await request('thread/list', {
            cwd: cwds,
            cursor,
            limit: 50,
            sortKey: 'updated_at',
            sortDirection: 'desc',
            // Codex Desktop also saves threads under the vscode source kind.
            sourceKinds: ['cli', 'vscode', 'appServer'],
            modelProviders: [],
          }),
        )
        threads.push(...page.data.filter((thread) => thread.updatedAt >= cutoff))
        if (page.data.some((thread) => thread.updatedAt < cutoff)) break
        cursor = page.nextCursor
      } while (cursor)
      return threads
    })
  },

  async read(id: string, cwd: string, signal: AbortSignal) {
    return await withCodexSessionReader(cwd, signal, async (request) => {
      const { thread } = v.parse(
        v.object({ thread: threadSchema }),
        await request('thread/read', { threadId: id, includeTurns: false }),
      )
      if (thread.id !== id || (await realpath(thread.cwd).catch(() => null)) !== cwd) return { thread, turns: [] }
      const turns: CodexHistoryTurn[] = []
      let cursor: string | null = null
      do {
        const page: CodexTurnPage = v.parse(
          turnPageSchema,
          await request('thread/turns/list', {
            threadId: id,
            itemsView: 'full',
            sortDirection: 'asc',
            cursor,
            limit: 50,
          }),
        )
        for (const turn of page.data) {
          const state =
            turn.status === 'completed'
              ? 'completed'
              : turn.status === 'failed'
                ? 'failed'
                : turn.status === 'interrupted'
                  ? 'cancelled'
                  : null
          if (!state) continue
          const prompts: string[] = []
          const replies: string[] = []
          const messages: NonNullable<CodexHistoryTurn['messages']> = []
          for (const item of turn.items) {
            const user = v.safeParse(userMessage, item)
            if (user.success) {
              const textParts: string[] = []
              for (const content of user.output.content) {
                const text = v.safeParse(textInput, content)
                if (text.success) textParts.push(text.output.text)
              }
              const content = textParts.join('\n')
              if (content.trim()) {
                prompts.push(content)
                messages.push({ role: 'user', content })
              }
            }
            const agent = v.safeParse(agentMessage, item)
            if (agent.success && agent.output.text.trim()) {
              replies.push(agent.output.text)
              messages.push({ role: 'assistant', content: agent.output.text })
            }
          }
          const prompt = prompts.join('\n')
          if (prompt.trim()) {
            turns.push({
              id: turn.id,
              prompt,
              reply: replies.join('\n\n'),
              messages,
              state,
              startedAt: turn.startedAt ?? undefined,
              completedAt: turn.completedAt ?? undefined,
            })
          }
        }
        cursor = page.nextCursor
      } while (cursor)
      return { thread, turns }
    })
  },
}
