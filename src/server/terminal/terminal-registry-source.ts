import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { serverLogger } from '#/server/logger.ts'
import type {
  TerminalLifecycleEvent,
  TerminalRecord,
  TerminalRecordPageInput,
  TerminalRecordTitle,
} from '#/server/terminal/terminal-registry-model.ts'

const runningPhases = "('opening', 'restarting', 'open')"
const SQLITE_BUSY = 5
const MAX_BUSY_RETRIES = 3
const BUSY_RETRY_DELAY_MS = 50
const TERMINAL_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const TERMINAL_EVENT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

interface RegistryRow {
  worker_id: string
  owner_pid: number
  created_seq: number
  snapshot: string
}

function serverIsRunning(pid: number): boolean {
  if (pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function transaction(db: DatabaseSync, action: () => void): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    action()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function persist(
  db: DatabaseSync,
  workerId: string,
  event: TerminalLifecycleEvent,
  previous: RegistryRow | undefined,
): void {
  const old = previous ? (JSON.parse(previous.snapshot) as TerminalRecord) : undefined
  const revision = (old?.revision ?? 0) + 1
  const time = new Date().toISOString()
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO terminal_events (terminal_id, execution_id, revision, occurred_at, snapshot)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(event.id, event.executionId, revision, time, JSON.stringify(event))
  const lastEventSeq = Number(lastInsertRowid)
  const snapshot: TerminalRecord = {
    ...event,
    revision,
    lastEventSeq,
    createdAt: old?.createdAt ?? time,
    updatedAt: time,
    executionStartedAt: old?.executionId === event.executionId ? old.executionStartedAt : time,
  }
  db.prepare(
    `INSERT INTO terminal_records (id, worker_id, owner_pid, workspace_id, phase, created_seq, snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, phase = excluded.phase,
       snapshot = excluded.snapshot`,
  ).run(
    event.id,
    workerId,
    process.pid,
    event.workspaceId,
    event.phase,
    previous?.created_seq ?? lastEventSeq,
    JSON.stringify(snapshot),
  )
}

function lifecycleFromRow(row: RegistryRow): TerminalLifecycleEvent {
  const { revision, lastEventSeq, createdAt, updatedAt, executionStartedAt, ...event } = JSON.parse(
    row.snapshot,
  ) as TerminalRecord
  return event
}

export function createTerminalRegistry(file: string) {
  let database: DatabaseSync | undefined
  let failed = false
  const pendingWrites: Array<(db: DatabaseSync) => void> = []
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let busyRetries = 0
  let cleanupTimer: ReturnType<typeof setInterval> | undefined

  function pruneEvents(db: DatabaseSync) {
    const cutoff = new Date(Date.now() - TERMINAL_EVENT_RETENTION_MS).toISOString()
    db.prepare('DELETE FROM terminal_events WHERE occurred_at < ?').run(cutoff)
  }

  function interrupt(db: DatabaseSync, rows: RegistryRow[], reason: 'worker_lost' | 'server_stopped') {
    for (const row of rows) {
      persist(db, row.worker_id, { ...lifecycleFromRow(row), phase: 'interrupted', reason }, row)
    }
  }

  function getDatabase() {
    if (database) return database
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const db = new DatabaseSync(file, { timeout: 0 })
    try {
      db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS terminal_records (
          id TEXT PRIMARY KEY NOT NULL,
          worker_id TEXT NOT NULL,
          owner_pid INTEGER NOT NULL,
          workspace_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          created_seq INTEGER NOT NULL UNIQUE,
          snapshot TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS terminal_records_by_worker ON terminal_records(worker_id, phase);
        CREATE INDEX IF NOT EXISTS terminal_records_by_workspace ON terminal_records(workspace_id, created_seq);
        CREATE TABLE IF NOT EXISTS terminal_events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          terminal_id TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          occurred_at TEXT NOT NULL,
          snapshot TEXT NOT NULL,
          UNIQUE (terminal_id, revision)
        );
        CREATE INDEX IF NOT EXISTS terminal_events_by_time ON terminal_events(occurred_at);
      `)
      transaction(db, () => {
        const running = db
          .prepare(
            `SELECT worker_id, owner_pid, created_seq, snapshot FROM terminal_records WHERE phase IN ${runningPhases}`,
          )
          .all() as unknown as RegistryRow[]
        const liveOwners = new Map<number, boolean>()
        const abandoned = running.filter(({ owner_pid }) => {
          if (!liveOwners.has(owner_pid)) liveOwners.set(owner_pid, serverIsRunning(owner_pid))
          return !liveOwners.get(owner_pid)
        })
        interrupt(db, abandoned, 'worker_lost')
        pruneEvents(db)
      })
      database = db
      cleanupTimer = setInterval(() => {
        try {
          pruneEvents(db)
        } catch (error) {
          serverLogger.debug({ err: error }, 'Unable to prune terminal lifecycle events')
        }
      }, TERMINAL_EVENT_CLEANUP_INTERVAL_MS).unref()
      return db
    } catch (error) {
      db.close()
      throw error
    }
  }

  function flushWrites(allowRetry = true): void {
    while (pendingWrites.length > 0) {
      const write = pendingWrites[0]!
      try {
        const db = getDatabase()
        transaction(db, () => write(db))
      } catch (error) {
        if (
          allowRetry &&
          busyRetries < MAX_BUSY_RETRIES &&
          error instanceof Error &&
          'errcode' in error &&
          error.errcode === SQLITE_BUSY
        ) {
          busyRetries++
          retryTimer = setTimeout(() => {
            retryTimer = undefined
            flushWrites()
          }, BUSY_RETRY_DELAY_MS).unref()
          return
        }
        failed = true
        serverLogger.error({ err: error }, 'Unable to persist terminal registry lifecycle')
      }
      pendingWrites.shift()
      busyRetries = 0
    }
  }

  function capture(write: (db: DatabaseSync) => void): void {
    pendingWrites.push(write)
    if (!retryTimer) flushWrites()
  }

  return {
    record(workerId: string, event: TerminalLifecycleEvent): void {
      capture((db) => {
        const previous = db
          .prepare('SELECT worker_id, owner_pid, created_seq, snapshot FROM terminal_records WHERE id = ?')
          .get(event.id) as RegistryRow | undefined
        if (previous && previous.worker_id !== workerId) return
        persist(db, workerId, event, previous)
      })
    },
    recordTitles(workerId: string, updates: TerminalRecordTitle[]): void {
      if (!updates.length) return
      capture((db) => {
        const find = db.prepare('SELECT worker_id, owner_pid, created_seq, snapshot FROM terminal_records WHERE id = ?')
        for (const { terminalId, executionId, title } of updates) {
          const row = find.get(terminalId) as RegistryRow | undefined
          if (row?.worker_id !== workerId) continue
          const event = lifecycleFromRow(row)
          if (event.executionId !== executionId || event.phase !== 'open' || (event.title ?? null) === title) continue
          persist(db, workerId, { ...event, title }, row)
        }
      })
    },
    interruptWorker(workerId: string, reason: 'worker_lost' | 'server_stopped'): void {
      if (!database && pendingWrites.length === 0) return
      capture((db) => {
        const rows = db
          .prepare(
            `SELECT worker_id, owner_pid, created_seq, snapshot FROM terminal_records
             WHERE worker_id = ? AND phase IN ${runningPhases}`,
          )
          .all(workerId) as unknown as RegistryRow[]
        interrupt(db, rows, reason)
      })
    },
    has(id: string): boolean {
      return Boolean(getDatabase().prepare('SELECT 1 FROM terminal_records WHERE id = ?').get(id))
    },
    list({ limit, cursor, workspaceId, state }: TerminalRecordPageInput) {
      if (failed) throw new Error('Terminal registry history needs reconciliation after a persistence failure')
      if (pendingWrites.length > 0) throw new Error('Terminal registry is waiting for lifecycle writes')
      const conditions: string[] = []
      const params: SQLInputValue[] = []
      if (cursor !== undefined) {
        conditions.push('created_seq < ?')
        params.push(cursor)
      }
      if (workspaceId) {
        conditions.push('workspace_id = ?')
        params.push(workspaceId)
      }
      if (state === 'running') conditions.push(`phase IN ${runningPhases}`)
      if (state === 'exited') conditions.push(`phase NOT IN ${runningPhases}`)
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const rows = getDatabase()
        .prepare(`SELECT created_seq, snapshot FROM terminal_records ${where} ORDER BY created_seq DESC LIMIT ?`)
        .all(...params, limit + 1) as unknown as Array<Pick<RegistryRow, 'created_seq' | 'snapshot'>>
      const nextCursor = rows.length > limit ? rows[limit - 1]!.created_seq : null
      const records = rows.slice(0, limit).map(({ snapshot }) => {
        const record = JSON.parse(snapshot) as TerminalRecord
        return { ...record, title: record.title ?? null }
      })
      return { records, nextCursor }
    },
    close(): void {
      clearTimeout(retryTimer)
      retryTimer = undefined
      flushWrites(false)
      clearInterval(cleanupTimer)
      cleanupTimer = undefined
      database?.close()
      database = undefined
    },
  }
}

export type TerminalRegistry = ReturnType<typeof createTerminalRegistry>
