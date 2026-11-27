import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createTerminalTranscript } from '#/server/terminal/terminal-transcript-source.ts'

test('pages in both directions and reports retention gaps after reopening the database', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hob-transcript-test-'))
  const file = path.join(dir, 'output.sqlite')
  const limits = { linesPerTerminal: 3, bytesPerTerminal: 200, totalBytes: 290 }
  const transcript = createTerminalTranscript(file, limits)
  const terminalId = 'terminal-a'
  const output = (data: string, id = terminalId, executionId = 'execution-a') =>
    transcript.append([{ terminalId: id, executionId, kind: 'output', data }])
  const recent = () => transcript.list({ terminalId, limit: 2 })
  try {
    output('a\nb\n')
    const initial = recent()
    expect(initial.lines.map(({ text }) => text)).toEqual(['a', 'b'])
    output('c\nd\ne\nf\n', terminalId, 'execution-b')
    const latest = recent()
    expect(latest).toMatchObject({ lines: [{ text: 'e' }, { text: 'f' }], gap: false, hasMoreBefore: true })
    expect(transcript.list({ terminalId, limit: 2, beforeSeq: latest.lines[0]!.seq })).toMatchObject({
      lines: [{ text: 'd', executionId: 'execution-b' }],
      hasMoreBefore: false,
      gap: true,
    })
    const firstDelta = transcript.list({ terminalId, limit: 1, afterSeq: initial.nextAfterSeq })
    expect(firstDelta).toMatchObject({ lines: [{ text: 'd' }], hasMoreAfter: true, gap: true })
    expect(transcript.list({ terminalId, limit: 2, afterSeq: firstDelta.nextAfterSeq })).toMatchObject({
      lines: [{ text: 'e' }, { text: 'f' }],
      hasMoreAfter: false,
      gap: false,
    })
    output('z'.repeat(100) + '\n', 'terminal-b')
    expect(recent().lines.map(({ text }) => text)).toEqual(['f'])
    output('z'.repeat(140) + '\n', terminalId, 'execution-b')
    expect(recent().lines).toEqual([])
    transcript.close()

    const reopened = createTerminalTranscript(file, limits)
    try {
      expect(reopened.list({ terminalId, limit: 1, afterSeq: initial.nextAfterSeq })).toMatchObject({
        lines: [],
        gap: true,
        nextAfterSeq: 8,
      })
    } finally {
      reopened.close()
    }
  } finally {
    transcript.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
