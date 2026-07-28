package com.mrongm.hobgoblin.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.mrongm.hobgoblin.terminals.TerminalDisconnectedReason
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxSessionIdentity
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.terminals.terminalDisconnectedMessageSnapshot
import com.mrongm.hobgoblin.terminals.terminalOutputSnapshot
import java.nio.charset.StandardCharsets
import java.util.Base64

interface TerminalSessionSnapshotStore {
    fun loadSessions(): List<TerminalSessionRecord>

    fun saveSessions(sessions: List<TerminalSessionRecord>)

    fun upsertSession(session: TerminalSessionRecord) {
        saveSessions(TerminalSessionStorePolicy.upsert(loadSessions(), session))
    }

    fun deleteSession(sessionId: String) {
        saveSessions(TerminalSessionStorePolicy.delete(loadSessions(), sessionId))
    }
}

class TerminalSessionStore private constructor(
    private val preferences: SharedPreferences,
) : TerminalSessionSnapshotStore {
    override fun loadSessions(): List<TerminalSessionRecord> =
        TerminalSessionCodec.decode(preferences.getString(KeySessions, "").orEmpty())

    override fun saveSessions(sessions: List<TerminalSessionRecord>) {
        preferences.edit { putString(KeySessions, TerminalSessionCodec.encode(sessions)) }
    }

    companion object {
        private const val PreferencesName = "hobgoblin-terminal-sessions"
        private const val KeySessions = "terminal-sessions"

        fun create(context: Context): TerminalSessionStore =
            TerminalSessionStore(context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE))
    }
}

object TerminalSessionStorePolicy {
    fun upsert(
        sessions: List<TerminalSessionRecord>,
        session: TerminalSessionRecord,
    ): List<TerminalSessionRecord> {
        var replaced = false
        val next = sessions.map {
            if (it.id == session.id) {
                replaced = true
                session
            } else {
                it
            }
        }
        return if (replaced) next else sessions + session
    }

    fun delete(
        sessions: List<TerminalSessionRecord>,
        sessionId: String,
    ): List<TerminalSessionRecord> = sessions.filterNot { it.id == sessionId }
}

object TerminalSessionCodec {
    private const val FieldSeparator = "."
    private const val RecordSeparator = "\n"
    private const val LegacyRecordFieldCount = 11
    private const val DisplayNameRecordFieldCount = 12
    private const val DisconnectMessageRecordFieldCount = 13
    private const val ProjectTerminalIdentityRecordFieldCount = 15
    private const val TmuxIdentityRecordFieldCount = 17
    private const val TmuxServerTargetRecordFieldCount = 18
    private const val DefaultTmuxServerMarker = "legacy-default"

    fun encode(sessions: List<TerminalSessionRecord>): String =
        sessions.joinToString(RecordSeparator) { session ->
            listOf(
                session.id,
                session.hostId,
                session.repositoryId.orEmpty(),
                session.remotePath,
                session.targetLabel,
                session.displayName,
                session.status.name,
                terminalOutputSnapshot(session.lastOutputSnapshot),
                session.lastActivityAt?.toString().orEmpty(),
                session.openedAt.toString(),
                session.foregroundServiceOwned.toString(),
                session.disconnectedReason?.name.orEmpty(),
                terminalDisconnectedMessageSnapshot(session.disconnectedMessage).orEmpty(),
                session.terminalId?.toString().orEmpty(),
                session.repositoryRemotePath.orEmpty(),
                session.tmuxIdentity?.sessionName.orEmpty(),
                session.tmuxIdentity?.initialPath.orEmpty(),
                when (val server = session.tmuxServerTarget) {
                    null -> ""
                    TmuxServerTarget.Default -> DefaultTmuxServerMarker
                    is TmuxServerTarget.Named -> server.serverName
                },
            ).joinToString(FieldSeparator) { it.encodeField() }
        }

    fun decode(payload: String): List<TerminalSessionRecord> {
        if (payload.isBlank()) return emptyList()
        return payload.lineSequence()
            .filter { it.isNotBlank() }
            .mapIndexedNotNull(::decodeSession)
            .toList()
    }

    private fun decodeSession(index: Int, line: String): TerminalSessionRecord? {
        val fields = line.split(FieldSeparator).map { it.decodeField() }
        if (
            fields.size !in listOf(
                LegacyRecordFieldCount,
                DisplayNameRecordFieldCount,
                DisconnectMessageRecordFieldCount,
                ProjectTerminalIdentityRecordFieldCount,
                TmuxIdentityRecordFieldCount,
                TmuxServerTargetRecordFieldCount,
            )
        ) return null
        return runCatching {
            val hasDisplayName = fields.size >= DisplayNameRecordFieldCount
            val hasDisconnectMessage = fields.size >= DisconnectMessageRecordFieldCount
            val hasProjectTerminalIdentity = fields.size >= ProjectTerminalIdentityRecordFieldCount
            val hasTmuxIdentity = fields.size >= TmuxIdentityRecordFieldCount
            val tmuxIdentity = if (hasTmuxIdentity) {
                val sessionName = fields.getOrNull(15).orEmpty()
                val initialPath = fields.getOrNull(16).orEmpty()
                runCatching {
                    if (
                        !TmuxSessionProtocol.isCurrentSessionName(sessionName) ||
                        TmuxSessionProtocol.normalizePath(initialPath) != initialPath
                    ) {
                        null
                    } else {
                        TmuxSessionIdentity(sessionName, initialPath)
                    }
                }.getOrNull()
            } else {
                null
            }
            val tmuxServerTarget = fields.getOrNull(17)
                ?.takeIf { fields.size == TmuxServerTargetRecordFieldCount && it.isNotBlank() }
                ?.let { marker ->
                    when (marker) {
                        DefaultTmuxServerMarker -> TmuxServerTarget.Default
                        else -> TmuxServerTarget.Named(marker)
                    }
                }
            TerminalSessionRecord(
                id = fields[0],
                hostId = fields[1],
                repositoryId = fields[2].takeIf { it.isNotBlank() },
                remotePath = fields[3],
                targetLabel = fields[4],
                displayName = fields[5].takeIf { hasDisplayName } ?: "",
                terminalId = fields.getOrNull(13)
                    ?.takeIf { hasProjectTerminalIdentity && it.isNotBlank() }
                    ?.toIntOrNull(),
                repositoryRemotePath = fields.getOrNull(14)
                    ?.takeIf { hasProjectTerminalIdentity && it.isNotBlank() },
                tmuxIdentity = tmuxIdentity,
                tmuxServerTarget = tmuxServerTarget,
                status = TerminalSessionStatus.valueOf(if (hasDisplayName) fields[6] else fields[5]),
                lastOutputSnapshot = terminalOutputSnapshot(if (hasDisplayName) fields[7] else fields[6]),
                lastActivityAt = (if (hasDisplayName) fields[8] else fields[7]).takeIf { it.isNotBlank() }?.toLong(),
                openedAt = (if (hasDisplayName) fields[9] else fields[8]).toLong(),
                foregroundServiceOwned = (if (hasDisplayName) fields[10] else fields[9]).toBooleanStrict(),
                disconnectedReason = (if (hasDisplayName) fields[11] else fields[10]).takeIf { it.isNotBlank() }?.let(
                    TerminalDisconnectedReason::valueOf,
                ),
                disconnectedMessage = fields.getOrNull(12)
                    ?.takeIf { hasDisconnectMessage && it.isNotBlank() }
                    ?.let(::terminalDisconnectedMessageSnapshot),
            )
        }.getOrNull()
    }

    private fun String.encodeField(): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(toByteArray(StandardCharsets.UTF_8))

    private fun String.decodeField(): String =
        String(Base64.getUrlDecoder().decode(this), StandardCharsets.UTF_8)
}
