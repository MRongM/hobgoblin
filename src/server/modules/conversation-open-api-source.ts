import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type {
  AgentSessionRecord,
  AgentTurnRecord,
  AgentTurnInput,
  AgentWorkspaceTarget,
} from '#/server/modules/agent-open-api-model.ts'
import type { AgentProviderResult } from '#/server/modules/agent-open-api-provider.ts'
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
  a.workspace_id AS workspaceId, a.worktree_id AS worktreeId, a.repo_id AS repoId, a.cwd,
  a.provider_session_id AS providerSessionId, a.closed_at AS closedAt`
const TURN_COLUMNS = `request_id AS requestId, conversation_id AS sessionId, prompt, state, error,
  created_at AS createdAt, finished_at AS finishedAt`
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
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
    `)
    transaction(
      db,
      () => {
        if (
          !db
            .prepare('PRAGMA table_info(agent_sessions)')
            .all()
            .some((column) => column.name === 'closed_at')
        ) {
          db.exec('ALTER TABLE agent_sessions ADD COLUMN closed_at TEXT')
        }
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

function readMessages(db: DatabaseSync, conversationId: string): ConversationMessage[] {
  return db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE conversation_id = ? ORDER BY sequence`)
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
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), id, role, JSON.stringify(content), date, date)
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

    getAgentSession(id: string): AgentSessionRecord | null {
      return readAgentSession(getDatabase(), id)
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
          writeAgentMessage(db, id, 'user', input.prompt, now)
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
            writeAgentMessage(db, id, 'assistant', result.reply, now)
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

    getConversation(id: string): Conversation | null {
      const db = getDatabase()
      return transaction(db, () => {
        const conversation = readConversation(db, id)
        return conversation ? { ...conversation, messages: readMessages(db, id) } : null
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

    deleteConversation(id: string): boolean {
      const { changes } = getDatabase().prepare('DELETE FROM conversations WHERE id = ?').run(id)
      return Number(changes) > 0
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
