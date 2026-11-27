import type { TerminalLifecycleEvent } from '#/server/terminal/terminal-registry-model.ts'
import type { TerminalTranscriptInput } from '#/server/terminal/terminal-transcript-model.ts'

const MAX_QUEUED_CHARS = 128 * 1024
const MAX_QUEUED_CHUNKS = 256
const BATCH_DELAY_MS = 30

export function createTerminalTranscriptCapture(send: (inputs: TerminalTranscriptInput[]) => void) {
  const executions = new Map<string, string>()
  const gaps = new Set<string>()
  let queued: TerminalTranscriptInput[] = []
  let queuedChars = 0
  let sending = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule() {
    if (timer || sending || queued.length === 0) return
    timer = setTimeout(() => {
      timer = undefined
      const batch = queued
      queued = []
      queuedChars = 0
      gaps.clear()
      sending = true
      send(batch)
    }, BATCH_DELAY_MS).unref()
  }

  return {
    lifecycle({ id: terminalId, executionId, phase }: TerminalLifecycleEvent) {
      if (phase === 'open') executions.set(terminalId, executionId)
      if (phase === 'closed' && executions.delete(terminalId)) {
        queued.push({ terminalId, executionId, kind: 'end' })
        schedule()
      }
    },
    output(terminalId: string, data: string) {
      const executionId = executions.get(terminalId)
      if (!executionId || !data) return
      if (queued.length >= MAX_QUEUED_CHUNKS || queuedChars + data.length > MAX_QUEUED_CHARS) {
        if (!gaps.has(executionId)) {
          gaps.add(executionId)
          queued.push({ terminalId, executionId, kind: 'gap' })
        }
      } else {
        queued.push({ terminalId, executionId, kind: 'output', data })
        queuedChars += data.length
        gaps.delete(executionId)
      }
      schedule()
    },
    acknowledge() {
      sending = false
      schedule()
    },
  }
}
