package com.mrongm.hobgoblin.data

import com.mrongm.hobgoblin.terminals.TerminalDisconnectedReason
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxSessionIdentity
import com.mrongm.hobgoblin.terminals.terminalOutputSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalSessionStoreTest {
    @Test
    fun `terminal sessions round trip through serialized storage payload`() {
        val record = terminalRecord()

        val decoded = TerminalSessionCodec.decode(TerminalSessionCodec.encode(listOf(record)))

        assertEquals(listOf(record), decoded)
        assertEquals("terminal-1", decoded.single().id)
        assertEquals("host-1", decoded.single().hostId)
        assertEquals("repo-1", decoded.single().repositoryId)
        assertEquals("/srv/app", decoded.single().remotePath)
        assertEquals("terminal-2", decoded.single().displayName)
        assertEquals(2, decoded.single().terminalId)
        assertEquals("/srv/repo", decoded.single().repositoryRemotePath)
        assertEquals(
            TmuxSessionIdentity(
                sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
                initialPath = "/srv/app",
            ),
            decoded.single().tmuxIdentity,
        )
        assertEquals(TerminalSessionStatus.Disconnected, decoded.single().status)
        assertEquals(250L, decoded.single().lastActivityAt)
        assertEquals("recent output", decoded.single().lastOutputSnapshot)
        assertTrue(decoded.single().foregroundServiceOwned)
        assertEquals(TerminalDisconnectedReason.AndroidServiceStopped, decoded.single().disconnectedReason)
        assertEquals("service process stopped", decoded.single().disconnectedMessage)
    }

    @Test
    fun `serialized terminal session payload excludes sensitive field names`() {
        val payload = TerminalSessionCodec.encode(listOf(terminalRecord()))

        assertFalse(payload.contains("password", ignoreCase = true))
        assertFalse(payload.contains("passphrase", ignoreCase = true))
        assertFalse(payload.contains("privateKey", ignoreCase = true))
        assertFalse(payload.contains("identityBytes", ignoreCase = true))
        assertFalse(payload.contains("socket", ignoreCase = true))
        assertFalse(payload.contains("handle", ignoreCase = true))
        assertTrue(payload.isNotBlank())
    }

    @Test
    fun `terminal session storage payload keeps output snapshot capped`() {
        val record = terminalRecord(lastOutputSnapshot = terminalOutputSnapshot("x".repeat(40_000)))

        val decoded = TerminalSessionCodec.decode(TerminalSessionCodec.encode(listOf(record))).single()

        assertEquals(TerminalSessionRecord.MaxOutputSnapshotChars, decoded.lastOutputSnapshot.length)
    }

    @Test
    fun `temporary terminal session round trip keeps tmux identity empty`() {
        val record = terminalRecord(
            id = "temporary-1",
            terminalId = null,
            repositoryRemotePath = null,
        )

        val decoded = TerminalSessionCodec.decode(TerminalSessionCodec.encode(listOf(record))).single()

        assertEquals(null, decoded.terminalId)
        assertEquals(null, decoded.repositoryRemotePath)
        assertEquals(null, decoded.tmuxIdentity)
    }

    @Test
    fun `legacy fifteen field terminal payload decodes without current tmux identity`() {
        val currentPayload = TerminalSessionCodec.encode(listOf(terminalRecord()))
        val legacyPayload = currentPayload.split('.').take(15).joinToString(".")

        val decoded = TerminalSessionCodec.decode(legacyPayload).single()

        assertEquals(2, decoded.terminalId)
        assertEquals("/srv/repo", decoded.repositoryRemotePath)
        assertEquals(null, decoded.tmuxIdentity)
    }

    @Test
    fun `terminal session store policy upserts and deletes records`() {
        val first = terminalRecord(id = "terminal-1")
        val updated = terminalRecord(id = "terminal-1", lastOutputSnapshot = "updated")
        val second = terminalRecord(id = "terminal-2")

        val upserted = TerminalSessionStorePolicy.upsert(listOf(first, second), updated)
        val deleted = TerminalSessionStorePolicy.delete(upserted, "terminal-1")

        assertEquals(listOf(updated, second), upserted)
        assertEquals(listOf(second), deleted)
    }

    private fun terminalRecord(
        id: String = "terminal-1",
        lastOutputSnapshot: String = "recent output",
        terminalId: Int? = 2,
        repositoryRemotePath: String? = "/srv/repo",
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = id,
        hostId = "host-1",
        repositoryId = "repo-1",
        remotePath = "/srv/app",
        targetLabel = "App - /srv/app",
        status = TerminalSessionStatus.Disconnected,
        displayName = "terminal-${terminalId ?: 1}",
        terminalId = terminalId,
        repositoryRemotePath = repositoryRemotePath,
        tmuxIdentity = if (terminalId == null) {
            null
        } else {
            TmuxSessionIdentity(
                sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
                initialPath = "/srv/app",
            )
        },
        lastOutputSnapshot = lastOutputSnapshot,
        lastActivityAt = 250L,
        openedAt = 100L,
        foregroundServiceOwned = true,
        disconnectedReason = TerminalDisconnectedReason.AndroidServiceStopped,
        disconnectedMessage = "service process stopped",
    )
}
