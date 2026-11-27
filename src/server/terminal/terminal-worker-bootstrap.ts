import type { TerminalWorkerMessage, TerminalWorkerRequest } from '#/server/terminal/terminal-worker-protocol.ts'
import { TerminalWorkerRuntime } from '#/server/terminal/terminal-worker-runtime.ts'
import { createTerminalFacade } from '#/server/terminal/terminal-facade.ts'
import {
  setServerTerminalLifecycleListener,
  setServerTerminalRecordTitleListener,
  setServerTerminalTranscriptListener,
} from '#/server/terminal/terminal.ts'
import type { TerminalRecordTitle } from '#/server/terminal/terminal-registry-model.ts'
import { createTerminalTranscriptCapture } from '#/server/terminal/terminal-transcript-capture.ts'
import { serverLogger } from '#/server/logger.ts'

export function createTerminalWorkerRuntime(
  emit: (message: TerminalWorkerMessage) => void,
  exit: (code: number) => void,
) {
  const transcript = createTerminalTranscriptCapture((inputs) => emit({ type: 'terminal-transcript', inputs }))
  const titles = new Map<string, TerminalRecordTitle>()
  let titleTimer: ReturnType<typeof setTimeout> | undefined
  setServerTerminalRecordTitleListener((event) => {
    titles.set(event.terminalId, event)
    titleTimer ??= setTimeout(() => {
      titleTimer = undefined
      if (titles.size === 0) return
      const updates = [...titles.values()]
      titles.clear()
      emit({ type: 'terminal-record-titles', updates })
    }, 250).unref()
  })
  let capture = false
  setServerTerminalTranscriptListener(undefined)
  setServerTerminalLifecycleListener((event, repoId) => {
    titles.delete(event.id)
    emit({ type: 'terminal-lifecycle', event, repoId })
    if (capture) transcript.lifecycle(event)
  })
  return new TerminalWorkerRuntime({
    service: createTerminalFacade(),
    configureTranscript() {
      capture = true
      setServerTerminalTranscriptListener(transcript.output)
    },
    acknowledgeTranscript: transcript.acknowledge,
    emit,
    exit,
  })
}

export function bootstrapTerminalWorker(): void {
  const runtime = createTerminalWorkerRuntime((message) => {
    if (!process.connected || !process.send) return
    if (
      message.type === 'terminal-lifecycle' ||
      message.type === 'terminal-transcript' ||
      message.type === 'terminal-record-titles'
    ) {
      process.send(message, (error) => {
        if (error) serverLogger.warn({ err: error, type: message.type }, 'Unable to forward terminal worker data')
      })
    } else process.send(message)
  }, process.exit)
  process.on('message', (raw) => {
    void runtime.handleMessage(raw as TerminalWorkerRequest)
  })
}
