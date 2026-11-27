import { once, on } from 'node:events'
import { realpath, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import * as v from 'valibot'
import WebSocket from 'ws'

const threadSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  cwd: v.string(),
  path: v.nullish(v.string()),
  updatedAt: v.number(),
  ephemeral: v.optional(v.boolean(), false),
  status: v.object({ type: v.string() }),
})

export type CodexLiveThread = v.InferOutput<typeof threadSchema>
type Request = (method: string, params: object) => Promise<unknown>

class CodexRequestRejected extends Error {}

function defaultSocketPath() {
  const home = process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex')
  return path.join(home, 'app-server-control', 'app-server-control.sock')
}

async function withAppServer<T>(signal: AbortSignal, use: (request: Request) => Promise<T>): Promise<T | null> {
  if (process.platform === 'win32') return null
  const socketPath = defaultSocketPath()
  const file = await stat(socketPath).catch(() => null)
  if (!file?.isSocket()) return null
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(5_000)])
  const socket = new WebSocket('ws://localhost/', {
    createConnection: () => createConnection(socketPath),
    handshakeTimeout: 2_000,
    maxPayload: 8 * 1024 * 1024,
    perMessageDeflate: false,
  })
  const frames = on(socket, 'message', { signal: deadline, close: ['close'] })
  let nextId = 0
  async function request(method: string, params: object) {
    const id = ++nextId
    socket.send(JSON.stringify({ id, method, params }))
    while (true) {
      const frame = await frames.next()
      if (frame.done) throw new Error('Codex App Server disconnected')
      const response = JSON.parse(frame.value[0].toString()) as { id?: number; result?: unknown; error?: unknown }
      if (response.id !== id) continue
      if (response.error) throw new CodexRequestRejected()
      return response.result
    }
  }
  try {
    await once(socket, 'open', { signal: deadline })
    await request('initialize', { clientInfo: { name: 'hobgoblin', title: 'Hobgoblin', version: '1.0.0' } })
    socket.send(JSON.stringify({ method: 'initialized' }))
    return await use(request)
  } finally {
    // The socket can report an error after aborting a connection attempt.
    socket.on('error', () => undefined)
    await frames.return?.()
    socket.close()
  }
}

async function readThread(request: Request, threadId: string) {
  const result = await request('thread/read', { threadId, includeTurns: false })
  return v.parse(v.object({ thread: threadSchema }), result).thread
}

export const codexLiveSessions = {
  async list(signal: AbortSignal): Promise<CodexLiveThread[] | null> {
    return await withAppServer(signal, async (request) => {
      const result = await request('thread/loaded/list', {})
      const { data } = v.parse(v.object({ data: v.array(v.string()) }), result)
      const threads: CodexLiveThread[] = []
      for (const id of data) {
        try {
          const thread = await readThread(request, id)
          if (!thread.ephemeral && thread.status.type !== 'notLoaded') threads.push(thread)
        } catch (error) {
          if (!(error instanceof CodexRequestRejected)) throw error
        }
      }
      return threads
    })
  },

  async send(threadId: string, cwd: string, prompt: string, signal: AbortSignal) {
    let submitted = false
    try {
      return (
        (await withAppServer(signal, async (request) => {
          const thread = await readThread(request, threadId)
          const canonical = await realpath(thread.cwd).catch(() => null)
          if (thread.id !== threadId || canonical !== cwd || thread.ephemeral || thread.status.type === 'notLoaded') {
            return { outcome: 'unavailable' } as const
          }
          if (thread.status.type !== 'idle') return { outcome: 'busy' } as const
          submitted = true
          const result = await request('turn/start', {
            threadId,
            input: [{ type: 'text', text: prompt, text_elements: [] }],
          })
          const { turn } = v.parse(v.object({ turn: v.object({ id: v.string() }) }), result)
          return { outcome: 'accepted', turnId: turn.id } as const
        })) ?? { outcome: 'unavailable' as const }
      )
    } catch (error) {
      if (error instanceof CodexRequestRejected) return { outcome: submitted ? 'rejected' : 'unavailable' } as const
      return { outcome: submitted ? 'unknown' : 'unavailable' } as const
    }
  },
}
