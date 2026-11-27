import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { createTerminalTranscriptLines } from '#/server/terminal/terminal-transcript-lines.ts'
import type {
  TerminalTranscriptInput,
  TerminalTranscriptPageInput,
} from '#/server/terminal/terminal-transcript-model.ts'

const DEFAULT_LIMITS = { linesPerTerminal: 20_000, bytesPerTerminal: 4 * 1024 ** 2, totalBytes: 128 * 1024 ** 2 }
type Limits = typeof DEFAULT_LIMITS
type OutputRow = { seq: number; executionId: string; text: string | null; truncated: number }
type EvictedRow = { seq: number; terminalId: string; bytes: number }

export function createTerminalTranscript(file: string, limits: Limits = DEFAULT_LIMITS) {
  let database: DatabaseSync | undefined
  const parser = createTerminalTranscriptLines()
  const pendingGaps = new Map<string, TerminalTranscriptInput>()

  function getDatabase() {
    if (database) return database
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const db = new DatabaseSync(file, { timeout: 0 })
    try {
      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA journal_size_limit = 16777216;
        CREATE TABLE IF NOT EXISTS terminal_output (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          terminal_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          text TEXT,
          truncated INTEGER NOT NULL,
          bytes INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS terminal_output_by_terminal ON terminal_output(terminal_id, seq);
        CREATE TABLE IF NOT EXISTS terminal_output_totals (
          terminal_id TEXT PRIMARY KEY NOT NULL,
          line_count INTEGER NOT NULL DEFAULT 0,
          bytes INTEGER NOT NULL DEFAULT 0,
          discarded_through INTEGER NOT NULL DEFAULT 0
        );
      `)
      database = db
      return db
    } catch (error) {
      db.close()
      throw error
    }
  }

  function persist(lines: ReturnType<typeof parser.consume>) {
    if (lines.length === 0) return
    const rows = lines.map((line) => ({ ...line, bytes: Buffer.byteLength(line.text ?? '') + 64 }))
    const totals = new Map<string, { lines: number; bytes: number }>()
    for (const { terminalId, bytes } of rows) {
      const total = totals.get(terminalId) ?? { lines: 0, bytes: 0 }
      total.lines++
      total.bytes += bytes
      totals.set(terminalId, total)
    }

    const db = getDatabase()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        `
        INSERT INTO terminal_output (terminal_id, execution_id, text, truncated, bytes)
        SELECT value ->> 'terminalId', value ->> 'executionId', value ->> 'text',
          value ->> 'truncated', value ->> 'bytes' FROM json_each(?) ORDER BY key
      `,
      ).run(JSON.stringify(rows))
      const add = db.prepare(`
        INSERT INTO terminal_output_totals (terminal_id, line_count, bytes) VALUES (?, ?, ?)
        ON CONFLICT(terminal_id) DO UPDATE SET
          line_count = line_count + excluded.line_count, bytes = bytes + excluded.bytes
        RETURNING line_count AS lines, bytes
      `)
      const subtract = db.prepare(`
        UPDATE terminal_output_totals SET line_count = line_count - ?, bytes = bytes - ?,
          discarded_through = MAX(discarded_through, ?) WHERE terminal_id = ?
      `)
      for (const [terminalId, added] of totals) {
        const total = add.get(terminalId, added.lines, added.bytes) as { lines: number; bytes: number }
        if (total.lines <= limits.linesPerTerminal && total.bytes <= limits.bytesPerTerminal) continue
        let seq = 0
        let removedLines = 0
        let removedBytes = 0
        for (const row of db
          .prepare('SELECT seq, bytes FROM terminal_output WHERE terminal_id = ? ORDER BY seq')
          .iterate(terminalId) as IterableIterator<Pick<EvictedRow, 'seq' | 'bytes'>>) {
          seq = row.seq
          removedLines++
          removedBytes += row.bytes
          if (
            total.lines - removedLines <= limits.linesPerTerminal &&
            total.bytes - removedBytes <= limits.bytesPerTerminal
          )
            break
        }
        db.prepare('DELETE FROM terminal_output WHERE terminal_id = ? AND seq <= ?').run(terminalId, seq)
        subtract.run(removedLines, removedBytes, seq, terminalId)
      }

      const { bytes } = db.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM terminal_output_totals').get() as {
        bytes: number
      }
      if (bytes > limits.totalBytes) {
        const removed = new Map<string, { lines: number; bytes: number; seq: number }>()
        let remaining = bytes
        let seq = 0
        for (const row of db
          .prepare('SELECT seq, terminal_id AS terminalId, bytes FROM terminal_output ORDER BY seq')
          .iterate() as IterableIterator<EvictedRow>) {
          const total = removed.get(row.terminalId) ?? { lines: 0, bytes: 0, seq: 0 }
          total.lines++
          total.bytes += row.bytes
          total.seq = seq = row.seq
          removed.set(row.terminalId, total)
          remaining -= row.bytes
          if (remaining <= limits.totalBytes) break
        }
        db.prepare('DELETE FROM terminal_output WHERE seq <= ?').run(seq)
        for (const [terminalId, total] of removed) subtract.run(total.lines, total.bytes, total.seq, terminalId)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return {
    append(inputs: TerminalTranscriptInput[]) {
      const batch = [...pendingGaps.values(), ...inputs]
      try {
        persist(parser.consume(batch))
        pendingGaps.clear()
      } catch (error) {
        for (const { terminalId, executionId } of batch) {
          pendingGaps.set(terminalId, { terminalId, executionId, kind: 'gap' })
        }
        parser.consume([...pendingGaps.values()])
        throw error
      }
    },
    list({ terminalId, limit, afterSeq, beforeSeq }: TerminalTranscriptPageInput) {
      const db = getDatabase()
      const after = afterSeq !== undefined
      const rows = db
        .prepare(
          `
        SELECT seq, execution_id AS executionId, text, truncated FROM terminal_output
        WHERE terminal_id = ? ${after ? 'AND seq > ?' : beforeSeq === undefined ? '' : 'AND seq < ?'}
        ORDER BY seq ${after ? 'ASC' : 'DESC'} LIMIT ?
      `,
        )
        .all(
          terminalId,
          ...(after ? [afterSeq] : beforeSeq === undefined ? [] : [beforeSeq]),
          limit + 1,
        ) as unknown as OutputRow[]
      const more = rows.length > limit
      const page = rows.slice(0, limit)
      if (!after) page.reverse()
      const discarded = Number(
        db.prepare('SELECT discarded_through FROM terminal_output_totals WHERE terminal_id = ?').get(terminalId)
          ?.discarded_through ?? 0,
      )
      const firstSeq = page[0]?.seq
      const hasMoreBefore = after
        ? firstSeq !== undefined &&
          !!db.prepare('SELECT 1 FROM terminal_output WHERE terminal_id = ? AND seq < ?').get(terminalId, firstSeq)
        : more
      const tail = beforeSeq === undefined ? parser.tail(terminalId) : null
      return {
        source: 'pty' as const,
        lines: page.map((row) => ({ ...row, truncated: Boolean(row.truncated) })),
        nextAfterSeq: page.at(-1)?.seq ?? Math.max(afterSeq ?? 0, discarded),
        hasMoreBefore,
        hasMoreAfter: after && more,
        gap: discarded > (afterSeq ?? 0) && !hasMoreBefore,
        tail: after && more ? null : tail,
      }
    },
    finish() {
      persist(parser.finish())
    },
    close() {
      try {
        persist(parser.finish())
      } finally {
        database?.close()
        database = undefined
      }
    },
  }
}

export type TerminalTranscript = ReturnType<typeof createTerminalTranscript>
