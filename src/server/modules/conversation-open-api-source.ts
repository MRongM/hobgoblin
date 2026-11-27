import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type {
  AgentSessionRecord,
  AgentTurnRecord,
  AgentTurnInput,
  AgentWorkspaceTarget,
  TerminalAgentLink,
} from '#/server/modules/agent-open-api-model.ts'
import type { AgentProviderResult } from '#/server/modules/agent-open-api-provider.ts'
import type { CodexHistoryTurn } from '#/server/modules/codex-session-history.ts'
import { serverLogger } from '#/server/logger.ts'
import type {
  Conversation,
  ConversationFilters,
  ConversationMessage,
  ConversationSummary,
  CreateConversation,
  CreateMessage,
  UpdateConversation,
  UpdateMessage,
} from '#/server/modules/conversation-open-api-model.ts'

const CONVERSATION_COLUMNS = `
  id, provider, title, terminal_session_id AS terminalSessionId, status,
  created_at AS createdAt, updated_at AS updatedAt
`
const MESSAGE_COLUMNS = 'id, role, content, created_at AS createdAt, updated_at AS updatedAt'
const AGENT_COLUMNS = `c.id, c.provider, c.created_at AS createdAt, c.updated_at AS updatedAt,
  c.revision, a.terminal_id AS terminalId,
  a.workspace_id AS workspaceId, a.worktree_id AS worktreeId, a.repo_id AS repoId, a.cwd,
  a.provider_session_id AS providerSessionId, a.closed_at AS closedAt, a.native_codex AS nativeCodex,
  a.terminal_execution_id AS terminalExecutionId, a.terminal_link_source AS terminalLinkSource`
const TURN_COLUMNS = `request_id AS requestId, conversation_id AS sessionId, prompt, state, error,
  created_at AS createdAt, finished_at AS finishedAt`
export const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const HISTORY_CLEANUP_INTERVAL_MS = 60 * 1000

function openDatabase(file: string): DatabaseSync {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 1000 })
  try {
    db.exec(`
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        provider TEXT NOT NULL,
        title TEXT,
        terminal_session_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        sequence INTEGER PRIMARY KEY,
        id TEXT UNIQUE NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id, sequence);
      CREATE INDEX IF NOT EXISTS messages_by_creation ON messages(created_at);
      CREATE INDEX IF NOT EXISTS conversations_by_update ON conversations(updated_at DESC, id);
      CREATE INDEX IF NOT EXISTS conversations_by_terminal ON conversations(terminal_session_id, updated_at DESC, id);
      CREATE TABLE IF NOT EXISTS agent_sessions (
        conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        repo_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        provider_session_id TEXT,
        native_codex INTEGER NOT NULL DEFAULT 0,
        closed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS agent_sessions_by_workspace ON agent_sessions(workspace_id);
      CREATE TABLE IF NOT EXISTS agent_turns (
        sequence INTEGER PRIMARY KEY,
        request_id TEXT UNIQUE NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES agent_sessions(conversation_id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        state TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS agent_turns_by_session ON agent_turns(conversation_id, sequence);
      CREATE INDEX IF NOT EXISTS agent_turns_by_creation ON agent_turns(created_at);
      CREATE TABLE IF NOT EXISTS native_codex_deliveries (
        request_id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES agent_sessions(conversation_id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        turn_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hidden_codex_threads (
        workspace_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        PRIMARY KEY (workspace_id, thread_id)
      );
    `)
    transaction(
      db,
      () => {
        const conversationColumns = db
          .prepare('PRAGMA table_info(conversations)')
          .all()
          .map(({ name }) => name)
        const agentColumns = db
          .prepare('PRAGMA table_info(agent_sessions)')
          .all()
          .map(({ name }) => name)
        const messageColumns = db
          .prepare('PRAGMA table_info(messages)')
          .all()
          .map(({ name }) => name)
        if (!conversationColumns.includes('revision'))
          db.exec('ALTER TABLE conversations ADD COLUMN revision INTEGER NOT NULL DEFAULT 1')
        if (!agentColumns.includes('closed_at')) db.exec('ALTER TABLE agent_sessions ADD COLUMN closed_at TEXT')
        if (!agentColumns.includes('native_codex'))
          db.exec('ALTER TABLE agent_sessions ADD COLUMN native_codex INTEGER NOT NULL DEFAULT 0')
        if (!agentColumns.includes('terminal_execution_id'))
          db.exec('ALTER TABLE agent_sessions ADD COLUMN terminal_execution_id TEXT')
        if (!agentColumns.includes('terminal_id')) db.exec('ALTER TABLE agent_sessions ADD COLUMN terminal_id TEXT')
        if (!agentColumns.includes('terminal_link_source'))
          db.exec('ALTER TABLE agent_sessions ADD COLUMN terminal_link_source TEXT')
        if (!messageColumns.includes('turn_request_id')) db.exec('ALTER TABLE messages ADD COLUMN turn_request_id TEXT')
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_by_terminal_execution ON agent_sessions(terminal_execution_id);
          CREATE TRIGGER IF NOT EXISTS conversation_advance_revision AFTER UPDATE ON conversations
          WHEN new.revision = old.revision BEGIN
            UPDATE conversations SET revision = old.revision + 1 WHERE id = new.id;
          END;
        `)
      },
      true,
    )
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

function transaction<T>(db: DatabaseSync, operation: () => T, write = false): T {
  db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function pruneExpiredHistory(db: DatabaseSync, now: number): number {
  const cutoff = new Date(now - HISTORY_RETENTION_MS).toISOString()
  return transaction(
    db,
    () => {
      // Foreign keys remove associated session metadata, turns and messages.
      db.prepare('DELETE FROM conversations WHERE updated_at <= ?').run(cutoff)
      db.prepare('DELETE FROM messages WHERE created_at <= ?').run(cutoff)
      db.prepare('DELETE FROM agent_turns WHERE created_at <= ?').run(cutoff)
      db.prepare('DELETE FROM native_codex_deliveries WHERE created_at <= ?').run(cutoff)

      const { oldest } = db
        .prepare(
          `
        SELECT min(timestamp) AS oldest FROM (
          SELECT min(updated_at) AS timestamp FROM conversations
          UNION ALL SELECT min(created_at) FROM messages
          UNION ALL SELECT min(created_at) FROM agent_turns
        )
      `,
        )
        .get() as { oldest: string | null }
      return (oldest ? Date.parse(oldest) : now) + HISTORY_RETENTION_MS
    },
    true,
  )
}

// JSON encoding preserves NUL and unpaired UTF-16 code units in SQLite text values.
function decodeConversation(row: unknown): ConversationSummary {
  const summary = row as ConversationSummary
  return { ...summary, title: summary.title === null ? null : (JSON.parse(summary.title) as string) }
}

function decodeMessage(row: unknown): ConversationMessage {
  const message = row as ConversationMessage
  return { ...message, content: JSON.parse(message.content) as string }
}

function readConversation(db: DatabaseSync, id: string): ConversationSummary | null {
  const row = db.prepare(`SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = ?`).get(id)
  return row ? decodeConversation(row) : null
}

function readMessage(db: DatabaseSync, conversationId: string, id: string): ConversationMessage | null {
  const row = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = ? AND id = ?`)
    .get(conversationId, id)
  return row ? decodeMessage(row) : null
}

function readMessages(db: DatabaseSync, conversationId: string, groupByTurn = false): ConversationMessage[] {
  // A recovered native reply has a newer storage sequence than the turn it belongs to.
  const order = groupByTurn ? 'min(sequence) OVER (PARTITION BY coalesce(turn_request_id, id)), sequence' : 'sequence'
  return db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = ? ORDER BY ${order}`)
    .all(conversationId)
    .map(decodeMessage)
}

function touchConversation(db: DatabaseSync, id: string, updatedAt: string): void {
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(updatedAt, id)
}

function cancelWorkingAgentTurn(db: DatabaseSync, id: string, requestId: string, now: string): boolean {
  const { changes } = db
    .prepare(
      `UPDATE agent_turns SET state = 'cancelled', finished_at = ?
    WHERE conversation_id = ? AND request_id = ? AND state = 'working'`,
    )
    .run(now, id, requestId)
  if (!changes) return false
  db.prepare("UPDATE conversations SET status = 'ready', updated_at = ? WHERE id = ?").run(now, id)
  return true
}

function readAgentSession(db: DatabaseSync, id: string): AgentSessionRecord | null {
  return (
    (db
      .prepare(
        `SELECT ${AGENT_COLUMNS} FROM agent_sessions a JOIN conversations c ON c.id = a.conversation_id WHERE c.id = ?`,
      )
      .get(id) as unknown as AgentSessionRecord | undefined) ?? null
  )
}

function readTerminalAgentSession(db: DatabaseSync, executionId: string): AgentSessionRecord | null {
  return (
    (db
      .prepare(
        `SELECT ${AGENT_COLUMNS}
    FROM agent_sessions a JOIN conversations c ON c.id = a.conversation_id WHERE a.terminal_execution_id = ?`,
      )
      .get(executionId) as unknown as AgentSessionRecord | undefined) ?? null
  )
}

function decodeAgentTurn(row: unknown): AgentTurnRecord | null {
  if (!row) return null
  const turn = row as AgentTurnRecord
  return { ...turn, prompt: JSON.parse(turn.prompt) as string }
}

function writeAgentMessage(
  db: DatabaseSync,
  id: string,
  role: CreateMessage['role'],
  content: string,
  date: string,
  requestId: string,
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, updated_at, turn_request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), id, role, JSON.stringify(content), date, date, requestId)
}

function importedTurnRequestId(providerSessionId: string, turnId: string): string {
  const bytes = createHash('sha256').update(providerSessionId).update('\0').update(turnId).digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x80
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

type ImportedCodexTurn = CodexHistoryTurn & { requestId: string }
type CodexMessage = NonNullable<CodexHistoryTurn['messages']>[number]

function codexMessages(turn: CodexHistoryTurn): CodexMessage[] {
  if (turn.messages) return turn.messages
  const messages: CodexMessage[] = [{ role: 'user', content: turn.prompt }]
  if (turn.reply) messages.push({ role: 'assistant', content: turn.reply })
  return messages
}

function writeCodexMessages(
  db: DatabaseSync,
  id: string,
  requestId: string,
  messages: CodexMessage[],
  started: string,
  completed: string,
) {
  for (const { role, content } of messages) {
    writeAgentMessage(db, id, role, content, role === 'user' ? started : completed, requestId)
  }
}

function writeCodexHistoryTurns(db: DatabaseSync, id: string, turns: ImportedCodexTurn[], updatedAt: number) {
  const addTurn = db.prepare(
    `INSERT INTO agent_turns (request_id, conversation_id, prompt, state, error, created_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (request_id) DO NOTHING`,
  )
  let wroteTurns = false
  for (const turn of turns) {
    const started = new Date((turn.startedAt ?? updatedAt) * 1_000).toISOString()
    const completed = new Date((turn.completedAt ?? updatedAt) * 1_000).toISOString()
    const state = turn.state ?? 'completed'
    const error = state === 'failed' ? 'provider_failed' : null
    if (!addTurn.run(turn.requestId, id, JSON.stringify(turn.prompt), state, error, started, completed).changes)
      continue
    writeCodexMessages(db, id, turn.requestId, codexMessages(turn), started, completed)
    wroteTurns = true
  }
  return wroteTurns
}

function fillInCodexHistoryTurns(db: DatabaseSync, id: string, turns: ImportedCodexTurn[], updatedAt: number) {
  if (!turns.length) return false
  const storedTurns = db
    .prepare('SELECT request_id AS requestId, state, created_at AS started FROM agent_turns WHERE conversation_id = ?')
    .all(id) as Array<{ requestId: string; state: string; started: string }>
  const turnsById = new Map(storedTurns.map((turn) => [turn.requestId, turn]))
  const counts = db
    .prepare(
      `SELECT turn_request_id AS requestId, count(*) AS count FROM messages
       WHERE conversation_id = ? AND turn_request_id IS NOT NULL GROUP BY turn_request_id`,
    )
    .all(id) as Array<{ requestId: string; count: number }>
  const countsByTurn = new Map(counts.map(({ requestId, count }) => [requestId, count]))
  const readTurnMessages = db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? AND turn_request_id = ? ORDER BY sequence',
  )
  const linkLegacyPrompt = db.prepare(
    `UPDATE messages SET turn_request_id = ? WHERE id = (
       SELECT id FROM messages
       WHERE conversation_id = ? AND turn_request_id IS NULL AND role = 'user' AND created_at = ? AND content = ?
       GROUP BY conversation_id HAVING count(*) = 1
     )`,
  )
  const completeTurn = db.prepare(
    "UPDATE agent_turns SET state = 'completed', error = NULL, finished_at = ? WHERE request_id = ?",
  )
  let changed = false
  for (const turn of turns) {
    const stored = turnsById.get(turn.requestId)
    if (!stored) continue
    const messages = codexMessages(turn)
    const completed = (turn.state ?? 'completed') === 'completed' && stored.state !== 'completed'
    let count = countsByTurn.get(turn.requestId) ?? 0
    const firstMessage = messages[0]
    // Older versions wrote the prompt without a turn ID. Link it when its timestamp and text agree.
    if (!count && completed && firstMessage?.role === 'user') {
      count = Number(linkLegacyPrompt.run(turn.requestId, id, stored.started, JSON.stringify(firstMessage.content)).changes)
    }
    if (!count) continue
    if (messages.length < count || (!completed && messages.length === count)) continue
    // A temporary snapshot may omit data. Only extend a matching, already stored prefix.
    const previous = readTurnMessages.all(id, turn.requestId)
    if (
      previous.some(({ role, content }, index) => {
        const message = messages[index]!
        return role !== message.role || content !== JSON.stringify(message.content)
      })
    )
      continue
    const finished = new Date((turn.completedAt ?? updatedAt) * 1_000).toISOString()
    writeCodexMessages(db, id, turn.requestId, messages.slice(count), stored.started, finished)
    if (completed) completeTurn.run(finished, turn.requestId)
    changed = true
  }
  return changed
}

export function createConversationOpenApiStore(file: string) {
  let database: DatabaseSync | undefined
  let closed = false
  let nextCleanupAt = Number.NEGATIVE_INFINITY

  function getDatabase(): DatabaseSync {
    if (closed) throw new Error('Conversation store is closed')
    const db = (database ??= openDatabase(file))
    const now = Date.now()
    if (now >= nextCleanupAt) nextCleanupAt = pruneExpiredHistory(db, now)
    return db
  }

  function cleanupIfPresent() {
    try {
      if (database || existsSync(file)) getDatabase()
    } catch {
      serverLogger.warn('Unable to prune expired conversation history')
    }
  }

  const startupCleanup = setTimeout(cleanupIfPresent, 0).unref()
  const cleanupTimer = setInterval(cleanupIfPresent, HISTORY_CLEANUP_INTERVAL_MS).unref()

  return {
    close(): void {
      closed = true
      clearTimeout(startupCleanup)
      clearInterval(cleanupTimer)
      database?.close()
      database = undefined
    },

    agentSessions(workspaceId: string): AgentSessionRecord[] {
      return getDatabase()
        .prepare(
          `SELECT ${AGENT_COLUMNS} FROM agent_sessions a JOIN conversations c ON c.id = a.conversation_id
        WHERE a.workspace_id = ? AND a.closed_at IS NULL ORDER BY c.updated_at DESC, c.id`,
        )
        .all(workspaceId) as unknown as AgentSessionRecord[]
    },

    agentSessionsPage(
      workspaceIds: string[],
      limit: number,
      cursor: Pick<AgentSessionRecord, 'id' | 'updatedAt'> | undefined,
      search: string,
      matchingWorkspaceIds: string[],
    ): AgentSessionRecord[] {
      const searchClause = search
        ? `AND (a.workspace_id IN (SELECT value FROM json_each(?))
          OR instr(lower(a.cwd), lower(?)) > 0
          OR instr(lower(c.provider), lower(?)) > 0
          OR instr(lower((SELECT json_extract(t.prompt, '$') FROM agent_turns t
            WHERE t.conversation_id = c.id ORDER BY t.sequence DESC LIMIT 1)), lower(?)) > 0)`
        : ''
      return getDatabase()
        .prepare(
          `SELECT ${AGENT_COLUMNS} FROM agent_sessions a JOIN conversations c ON c.id = a.conversation_id
           WHERE a.closed_at IS NULL AND a.workspace_id IN (SELECT value FROM json_each(?))
           AND (? IS NULL OR c.updated_at < ? OR (c.updated_at = ? AND c.id > ?))
           ${searchClause}
           ORDER BY c.updated_at DESC, c.id ASC LIMIT ?`,
        )
        .all(
          JSON.stringify(workspaceIds),
          cursor?.updatedAt ?? null,
          cursor?.updatedAt ?? null,
          cursor?.updatedAt ?? null,
          cursor?.id ?? null,
          ...(search ? [JSON.stringify(matchingWorkspaceIds), search, search, search] : []),
          limit,
        ) as unknown as AgentSessionRecord[]
    },

    getAgentSession(id: string): AgentSessionRecord | null {
      return readAgentSession(getDatabase(), id)
    },
    getTerminalAgentSession(executionId: string): AgentSessionRecord | null {
      return readTerminalAgentSession(getDatabase(), executionId)
    },

    bindTerminalAgent(
      target: AgentWorkspaceTarget,
      link: TerminalAgentLink,
      provider: CreateConversation['provider'],
      existingId?: string,
    ): AgentSessionRecord | null {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const bound = readTerminalAgentSession(db, link.executionId)
          const selected = existingId ? readAgentSession(db, existingId) : null
          if (
            existingId &&
            (!selected ||
              selected.closedAt ||
              selected.provider !== provider ||
              selected.workspaceId !== target.workspaceId ||
              selected.worktreeId !== target.worktreeId)
          )
            return null
          if (bound && !bound.closedAt && bound.provider !== provider) {
            const correctDetection =
              link.source === 'manual' &&
              bound.terminalLinkSource === 'detected' &&
              !bound.providerSessionId &&
              !db.prepare('SELECT 1 FROM messages WHERE conversation_id = ?').get(bound.id)
            if (!correctDetection) return null
          }
          if (bound && (!selected || bound.id === selected.id)) {
            if (bound.closedAt) return null
            if (link.source !== 'manual' || bound.terminalLinkSource !== 'detected') return bound
          }

          const now = new Date().toISOString()
          if (bound && selected && bound.id !== selected.id) {
            // Keep the provider's existing identity and retire the empty execution placeholder.
            if (bound.providerSessionId || db.prepare('SELECT 1 FROM messages WHERE conversation_id = ?').get(bound.id))
              return null
            db.prepare(
              'UPDATE agent_sessions SET terminal_id = NULL, terminal_execution_id = NULL, terminal_link_source = NULL, closed_at = ? WHERE conversation_id = ?',
            ).run(now, bound.id)
            db.prepare('UPDATE conversations SET terminal_session_id = NULL, updated_at = ? WHERE id = ?').run(
              now,
              bound.id,
            )
          }
          const id = selected?.id ?? bound?.id ?? link.executionId
          if (!selected && !bound) {
            db.prepare(
              `INSERT INTO conversations (id, provider, status, created_at, updated_at)
            VALUES (?, ?, 'ready', ?, ?)`,
            ).run(id, provider, now, now)
            db.prepare(
              `INSERT INTO agent_sessions (conversation_id, workspace_id, worktree_id, repo_id, cwd)
            VALUES (?, ?, ?, ?, ?)`,
            ).run(id, target.workspaceId, target.worktreeId, target.repoId, target.cwd)
          }
          db.prepare(
            'UPDATE agent_sessions SET terminal_id = ?, terminal_execution_id = ?, terminal_link_source = ? WHERE conversation_id = ?',
          ).run(link.terminalId, link.executionId, link.source, id)
          db.prepare('UPDATE conversations SET terminal_session_id = ?, provider = ?, updated_at = ? WHERE id = ?').run(
            link.terminalId,
            provider,
            now,
            id,
          )
          return readAgentSession(db, id)
        },
        true,
      )
    },

    listAgentTurns(id: string, limit: number, before?: number) {
      return getDatabase()
        .prepare(
          `SELECT sequence AS seq, ${TURN_COLUMNS} FROM agent_turns
        WHERE conversation_id = ? AND (? IS NULL OR sequence < ?)
        ORDER BY sequence DESC LIMIT ?`,
        )
        .all(id, before ?? null, before ?? null, limit)
        .map((row) => ({ ...decodeAgentTurn(row)!, seq: Number(row.seq) }))
    },

    listAgentMessages(id: string, limit: number, before?: number) {
      return getDatabase()
        .prepare(
          `SELECT sequence AS seq, turn_request_id AS turnRequestId, ${MESSAGE_COLUMNS} FROM messages
        WHERE conversation_id = ? AND (? IS NULL OR sequence < ?)
        ORDER BY sequence DESC LIMIT ?`,
        )
        .all(id, before ?? null, before ?? null, limit)
        .map(({ seq, turnRequestId, ...row }) => ({
          ...decodeMessage(row),
          seq: Number(seq),
          turnRequestId: typeof turnRequestId === 'string' ? turnRequestId : null,
        }))
    },

    getLatestAgentTurn(id: string): AgentTurnRecord | null {
      return decodeAgentTurn(
        getDatabase()
          .prepare(
            `SELECT ${TURN_COLUMNS} FROM agent_turns WHERE conversation_id = ?
        ORDER BY sequence DESC LIMIT 1`,
          )
          .get(id),
      )
    },

    getAgentTurn(requestId: string): AgentTurnRecord | null {
      return decodeAgentTurn(
        getDatabase().prepare(`SELECT ${TURN_COLUMNS} FROM agent_turns WHERE request_id = ?`).get(requestId),
      )
    },

    readTurnReply(sessionId: string, requestId: string): string | null {
      const row = getDatabase()
        .prepare(
          `
        SELECT content FROM messages WHERE conversation_id = ? AND turn_request_id = ? AND role = 'assistant'
        ORDER BY sequence DESC LIMIT 1
      `,
        )
        .get(sessionId, requestId)
      return row ? (JSON.parse(String(row.content)) as string) : null
    },

    listHiddenCodexThreads(workspaceId: string): Set<string> {
      const rows = getDatabase()
        .prepare('SELECT thread_id FROM hidden_codex_threads WHERE workspace_id = ?')
        .all(workspaceId) as Array<{ thread_id: string }>
      return new Set(rows.map(({ thread_id }) => thread_id))
    },

    importCodexSession(
      target: AgentWorkspaceTarget,
      providerSessionId: string,
      turns: CodexHistoryTurn[],
      updatedAt: number,
      native = false,
    ) {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          if (
            native &&
            db
              .prepare('SELECT 1 FROM hidden_codex_threads WHERE workspace_id = ? AND thread_id = ?')
              .get(target.workspaceId, providerSessionId)
          )
            return null
          const existing = db
            .prepare(
              `SELECT ${AGENT_COLUMNS} FROM agent_sessions a JOIN conversations c ON c.id = a.conversation_id
              WHERE a.provider_session_id = ? AND c.provider = 'codex'
              ORDER BY (a.closed_at IS NOT NULL), c.updated_at DESC LIMIT 1`,
            )
            .get(providerSessionId) as unknown as AgentSessionRecord | undefined
          if (
            existing &&
            (existing.closedAt ||
              existing.workspaceId !== target.workspaceId ||
              existing.worktreeId !== target.worktreeId)
          )
            return null
          const cutoff = Date.now() - HISTORY_RETENTION_MS
          const retained = turns.filter((turn) => (turn.completedAt ?? turn.startedAt ?? updatedAt) * 1_000 >= cutoff)
          if (retained.length === 0 && !native) return existing ?? null
          const id = existing?.id ?? randomUUID()
          const lastDate = new Date(updatedAt * 1_000).toISOString()
          const imported = retained.map((turn) => ({
            ...turn,
            requestId: importedTurnRequestId(providerSessionId, turn.id),
          }))
          let newTurns = imported
          if (existing) {
            const latest = db
              .prepare(
                'SELECT request_id AS id, state FROM agent_turns WHERE conversation_id = ? ORDER BY sequence DESC LIMIT 1',
              )
              .get(id) as { id: string; state: string } | undefined
            if (latest?.state === 'working') return null
            if (native && !existing.nativeCodex) {
              db.prepare('UPDATE agent_sessions SET native_codex = 1 WHERE conversation_id = ?').run(id)
            }
            const anchor = imported.findIndex((turn) => turn.requestId === latest?.id)
            newTurns =
              anchor >= 0
                ? imported.slice(anchor + 1)
                : latest
                  ? imported.filter((turn) => (turn.startedAt ?? 0) * 1_000 >= Date.parse(existing.updatedAt))
                  : imported
          } else {
            const firstDate = new Date((retained[0]?.startedAt ?? updatedAt) * 1_000).toISOString()
            db.prepare(
              `INSERT INTO conversations (id, provider, status, created_at, updated_at)
               VALUES (?, 'codex', 'ready', ?, ?)`,
            ).run(id, firstDate, lastDate)
            db.prepare(
              `INSERT INTO agent_sessions
               (conversation_id, workspace_id, worktree_id, repo_id, cwd, provider_session_id, native_codex)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              id,
              target.workspaceId,
              target.worktreeId,
              target.repoId,
              target.cwd,
              providerSessionId,
              Number(native),
            )
          }
          const filledInTurns = existing && native && fillInCodexHistoryTurns(db, id, imported, updatedAt)
          const wroteTurns = writeCodexHistoryTurns(db, id, newTurns, updatedAt)
          if (existing && (wroteTurns || filledInTurns)) {
            touchConversation(db, id, new Date().toISOString())
          }
          return readAgentSession(db, id)
        },
        true,
      )
    },

    getNativeCodexDelivery(requestId: string) {
      const row = getDatabase()
        .prepare(
          `SELECT conversation_id AS sessionId, prompt, turn_id AS turnId, created_at AS createdAt
         FROM native_codex_deliveries WHERE request_id = ?`,
        )
        .get(requestId) as { sessionId: string; prompt: string; turnId: string | null; createdAt: string } | undefined
      return row ? { ...row, prompt: JSON.parse(row.prompt) as string } : null
    },

    reserveNativeCodexDelivery(id: string, input: AgentTurnInput): void {
      getDatabase()
        .prepare(
          'INSERT INTO native_codex_deliveries (request_id, conversation_id, prompt, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(input.requestId, id, JSON.stringify(input.prompt), new Date().toISOString())
    },

    settleNativeCodexDelivery(requestId: string, turnId: string | null): void {
      const db = getDatabase()
      if (turnId === null) {
        db.prepare('DELETE FROM native_codex_deliveries WHERE request_id = ?').run(requestId)
      } else {
        db.prepare('UPDATE native_codex_deliveries SET turn_id = ? WHERE request_id = ?').run(turnId, requestId)
      }
    },

    readDeliveredCodexTurn(id: string, providerSessionId: string, requestId: string): AgentTurnRecord | null {
      const receipt = this.getNativeCodexDelivery(requestId)
      if (!receipt?.turnId || receipt.sessionId !== id) return null
      const turn = this.getAgentTurn(importedTurnRequestId(providerSessionId, receipt.turnId))
      return turn
        ? { ...turn, requestId }
        : {
            requestId,
            sessionId: id,
            prompt: receipt.prompt,
            createdAt: receipt.createdAt,
            state: 'working',
            error: null,
            finishedAt: null,
          }
    },

    appendCodexTerminalTurns(id: string, providerSessionId: string, turns: CodexHistoryTurn[], updatedAt: number) {
      const db = getDatabase()
      transaction(
        db,
        () => {
          const session = readAgentSession(db, id)
          if (
            session?.closedAt !== null ||
            session.provider !== 'codex' ||
            session.providerSessionId !== providerSessionId
          )
            return
          const cutoff = Date.now() - HISTORY_RETENTION_MS
          const retained = turns
            .filter((turn) => (turn.completedAt ?? turn.startedAt ?? updatedAt) * 1_000 >= cutoff)
            .map((turn) => ({ ...turn, requestId: importedTurnRequestId(providerSessionId, turn.id) }))
          if (writeCodexHistoryTurns(db, id, retained, updatedAt)) {
            db.prepare("UPDATE conversations SET status = 'ready', updated_at = ? WHERE id = ?").run(
              new Date().toISOString(),
              id,
            )
          }
        },
        true,
      )
    },

    beginAgentTurn(
      id: string,
      input: AgentTurnInput,
      create?: AgentWorkspaceTarget & Pick<CreateConversation, 'provider'>,
    ): AgentSessionRecord {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const now = new Date().toISOString()
          if (create) {
            db.prepare(
              `INSERT INTO conversations (id, provider, status, created_at, updated_at)
            VALUES (?, ?, 'working', ?, ?)`,
            ).run(id, create.provider, now, now)
            db.prepare(
              `INSERT INTO agent_sessions (conversation_id, workspace_id, worktree_id, repo_id, cwd)
            VALUES (?, ?, ?, ?, ?)`,
            ).run(id, create.workspaceId, create.worktreeId, create.repoId, create.cwd)
          }
          db.prepare(
            `UPDATE agent_turns SET state = 'failed', error = 'interrupted', finished_at = ?
          WHERE conversation_id = ? AND state = 'working'`,
          ).run(now, id)
          db.prepare(
            `INSERT INTO agent_turns (request_id, conversation_id, prompt, state, created_at)
          VALUES (?, ?, ?, 'working', ?)`,
          ).run(input.requestId, id, JSON.stringify(input.prompt), now)
          writeAgentMessage(db, id, 'user', input.prompt, now, input.requestId)
          db.prepare(`UPDATE conversations SET status = 'working', updated_at = ? WHERE id = ?`).run(now, id)
          const session = readAgentSession(db, id)
          if (!session) throw new Error('Agent session was not created')
          return session
        },
        true,
      )
    },

    finishAgentTurn(id: string, requestId: string, result: AgentProviderResult): void {
      const db = getDatabase()
      transaction(
        db,
        () => {
          const now = new Date().toISOString()
          const turn = db
            .prepare(
              `UPDATE agent_turns SET state = ?, error = ?, finished_at = ?
          WHERE conversation_id = ? AND request_id = ? AND state = 'working'`,
            )
            .run(result.ok ? 'completed' : 'failed', result.ok ? null : result.error, now, id, requestId)
          if (!turn.changes) return
          if (result.ok) {
            db.prepare('UPDATE agent_sessions SET provider_session_id = ? WHERE conversation_id = ?').run(
              result.providerSessionId,
              id,
            )
            writeAgentMessage(db, id, 'assistant', result.reply, now, requestId)
          }
          db.prepare(`UPDATE conversations SET status = 'ready', updated_at = ? WHERE id = ?`).run(now, id)
        },
        true,
      )
    },

    cancelAgentTurn(id: string, requestId: string): boolean {
      const db = getDatabase()
      return transaction(db, () => cancelWorkingAgentTurn(db, id, requestId, new Date().toISOString()), true)
    },

    closeAgentSession(id: string): boolean {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const session = readAgentSession(db, id)
          if (!session) return false
          if (session.closedAt) return true
          const now = new Date().toISOString()
          db.prepare('UPDATE agent_sessions SET closed_at = ? WHERE conversation_id = ?').run(now, id)
          db.prepare(
            `UPDATE agent_turns SET state = 'cancelled', finished_at = ?
          WHERE conversation_id = ? AND state = 'working'`,
          ).run(now, id)
          db.prepare("UPDATE conversations SET status = 'ready', updated_at = ? WHERE id = ?").run(now, id)
          return true
        },
        true,
      )
    },

    listConversations(filters: ConversationFilters): ConversationSummary[] {
      const { provider = null, status = null, terminalSessionId = null } = filters
      return getDatabase()
        .prepare(
          `
          SELECT ${CONVERSATION_COLUMNS} FROM conversations
          WHERE (? IS NULL OR provider = ?) AND (? IS NULL OR status = ?)
            AND (? IS NULL OR terminal_session_id = ?)
          ORDER BY updated_at DESC, id
        `,
        )
        .all(provider, provider, status, status, terminalSessionId, terminalSessionId)
        .map(decodeConversation)
    },

    createConversation(input: CreateConversation): ConversationSummary {
      const createdAt = new Date().toISOString()
      const conversation: ConversationSummary = {
        id: randomUUID(),
        provider: input.provider,
        title: input.title ?? null,
        terminalSessionId: input.terminalSessionId ?? null,
        status: input.status ?? 'ready',
        createdAt,
        updatedAt: createdAt,
      }
      getDatabase()
        .prepare(
          `
          INSERT INTO conversations (id, provider, title, terminal_session_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          conversation.id,
          conversation.provider,
          conversation.title === null ? null : JSON.stringify(conversation.title),
          conversation.terminalSessionId,
          conversation.status,
          createdAt,
          createdAt,
        )
      return conversation
    },

    getConversation(id: string, groupByTurn = false): Conversation | null {
      const db = getDatabase()
      return transaction(db, () => {
        const conversation = readConversation(db, id)
        return conversation ? { ...conversation, messages: readMessages(db, id, groupByTurn) } : null
      })
    },

    getConversationSummary(id: string): ConversationSummary | null {
      return readConversation(getDatabase(), id)
    },

    conversationIdsByTerminal(sessionIds: string[]): Map<string, string> {
      if (!sessionIds.length) return new Map()
      const rows = getDatabase()
        .prepare(
          `SELECT terminal_session_id AS sessionId, id FROM conversations
        WHERE terminal_session_id IN (SELECT value FROM json_each(?)) ORDER BY updated_at ASC, id DESC`,
        )
        .all(JSON.stringify(sessionIds)) as unknown as Array<{ sessionId: string; id: string }>
      return new Map(rows.map((row) => [row.sessionId, row.id]))
    },

    updateConversation(id: string, input: UpdateConversation): ConversationSummary | null {
      const db = getDatabase()
      const row = db
        .prepare(
          `
          UPDATE conversations SET
            title = CASE WHEN ? THEN ? ELSE title END,
            terminal_session_id = CASE WHEN ? THEN ? ELSE terminal_session_id END,
            status = COALESCE(?, status), updated_at = ?
          WHERE id = ? RETURNING ${CONVERSATION_COLUMNS}
        `,
        )
        .get(
          Number(input.title !== undefined),
          typeof input.title === 'string' ? JSON.stringify(input.title) : null,
          Number(input.terminalSessionId !== undefined),
          input.terminalSessionId ?? null,
          input.status ?? null,
          new Date().toISOString(),
          id,
        )
      return row ? decodeConversation(row) : null
    },

    deleteConversation(id: string, hideCodexThread = false): boolean {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const session = readAgentSession(db, id)
          if (session?.provider === 'codex' && session.providerSessionId && (session.nativeCodex || hideCodexThread)) {
            db.prepare('INSERT OR IGNORE INTO hidden_codex_threads (workspace_id, thread_id) VALUES (?, ?)').run(
              session.workspaceId,
              session.providerSessionId,
            )
          }
          return Number(db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes) > 0
        },
        true,
      )
    },

    listMessages(conversationId: string): ConversationMessage[] | null {
      const db = getDatabase()
      return transaction(db, () => {
        const conversation = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(conversationId)
        return conversation ? readMessages(db, conversationId) : null
      })
    },

    createMessage(conversationId: string, input: CreateMessage): ConversationMessage | null {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const createdAt = new Date().toISOString()
          const message = { ...input, id: randomUUID(), createdAt, updatedAt: createdAt }
          const { changes } = db
            .prepare(
              `
            INSERT INTO messages (id, conversation_id, role, content, created_at, updated_at)
            SELECT ?, id, ?, ?, ?, ? FROM conversations WHERE id = ?
          `,
            )
            .run(message.id, message.role, JSON.stringify(message.content), createdAt, createdAt, conversationId)
          if (!changes) return null
          touchConversation(db, conversationId, createdAt)
          return message
        },
        true,
      )
    },

    getMessage(conversationId: string, id: string): ConversationMessage | null {
      return readMessage(getDatabase(), conversationId, id)
    },

    updateMessage(conversationId: string, id: string, input: UpdateMessage): ConversationMessage | null {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const updatedAt = new Date().toISOString()
          const row = db
            .prepare(
              `
            UPDATE messages SET role = COALESCE(?, role), content = COALESCE(?, content), updated_at = ?
            WHERE conversation_id = ? AND id = ? RETURNING ${MESSAGE_COLUMNS}
          `,
            )
            .get(
              input.role ?? null,
              input.content === undefined ? null : JSON.stringify(input.content),
              updatedAt,
              conversationId,
              id,
            )
          if (!row) return null
          touchConversation(db, conversationId, updatedAt)
          return decodeMessage(row)
        },
        true,
      )
    },

    deleteMessage(conversationId: string, id: string): boolean {
      const db = getDatabase()
      return transaction(
        db,
        () => {
          const { changes } = db
            .prepare('DELETE FROM messages WHERE conversation_id = ? AND id = ?')
            .run(conversationId, id)
          if (!changes) return false
          touchConversation(db, conversationId, new Date().toISOString())
          return true
        },
        true,
      )
    },
  }
}

export type ConversationOpenApiStore = ReturnType<typeof createConversationOpenApiStore>
