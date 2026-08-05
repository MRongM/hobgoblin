package com.mrongm.hobgoblin.data

import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import java.nio.charset.StandardCharsets
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteRepositoryStoreTest {
    @Test
    fun `remote repository profile normalizes display fields`() {
        val repo = RemoteRepositoryProfile.create(
            hostProfileId = " host-1 ",
            alias = " App ",
            remotePath = " /srv/app ",
        )

        assertEquals("host-1", repo.hostProfileId)
        assertEquals("App", repo.alias)
        assertEquals("/srv/app", repo.remotePath)
        assertEquals("App", repo.title)
        assertTrue(requireNotNull(repo.createdAt) > 0L)
    }

    @Test
    fun `remote repository profile requires an absolute remote path`() {
        assertThrows(IllegalArgumentException::class.java) {
            RemoteRepositoryProfile.create(hostProfileId = "host-1", alias = null, remotePath = "")
        }
        assertThrows(IllegalArgumentException::class.java) {
            RemoteRepositoryProfile.create(hostProfileId = "host-1", alias = null, remotePath = "srv/app")
        }
        assertThrows(IllegalArgumentException::class.java) {
            RemoteRepositoryProfile.create(
                hostProfileId = "host-1",
                alias = null,
                remotePath = "/srv/app",
                createdAt = 0L,
            )
        }
    }

    @Test
    fun `remote repository profile retains supplied created time`() {
        val createdAt = 1_700_000_000_000L
        val repository = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "App",
            remotePath = "/srv/app",
            createdAt = createdAt,
        )

        assertEquals(createdAt, repository.createdAt)
    }

    @Test
    fun `remote repositories round trip through serialized storage payload`() {
        val repo = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "App",
            remotePath = "/srv/app",
            createdAt = 1_700_000_000_000L,
        )

        val decoded = RemoteRepositoryCodec.decode(RemoteRepositoryCodec.encode(listOf(repo)))

        assertEquals(listOf(repo), decoded)
    }

    @Test
    fun `plain workspaces preserve their kind through serialized storage`() {
        val workspace = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "Scripts",
            remotePath = "/srv/scripts",
            kind = RemoteProjectKind.PlainWorkspace,
        )

        val decoded = RemoteRepositoryCodec.decode(RemoteRepositoryCodec.encode(listOf(workspace)))

        assertFalse(workspace.isGitRepository)
        assertEquals(listOf(workspace), decoded)
    }

    @Test
    fun `legacy four field project records remain git repositories`() {
        val legacyPayload = encodedRecord("project-1", "host-1", "App", "/srv/app")

        val decoded = RemoteRepositoryCodec.decode(legacyPayload)

        assertEquals(RemoteProjectKind.GitRepository, decoded.single().kind)
        assertTrue(decoded.single().isGitRepository)
        assertNull(decoded.single().createdAt)
    }

    @Test
    fun `legacy five field project records have unknown created time`() {
        val legacyPayload = encodedRecord("project-1", "host-1", "App", "/srv/app", "git")

        val decoded = RemoteRepositoryCodec.decode(legacyPayload)

        assertNull(decoded.single().createdAt)
    }

    @Test
    fun `malformed persisted project created time is ignored`() {
        val payload = encodedRecord("project-1", "host-1", "App", "/srv/app", "git", "invalid")

        assertTrue(RemoteRepositoryCodec.decode(payload).isEmpty())
    }

    @Test
    fun `unknown persisted project kinds are ignored`() {
        val payload = encodedRecord("project-1", "host-1", "App", "/srv/app", "future-kind")

        assertTrue(RemoteRepositoryCodec.decode(payload).isEmpty())
    }

    @Test
    fun `remote repository update preserves original created time`() {
        val original = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "App",
            remotePath = "/srv/app",
            createdAt = 1_000L,
        ).copy(id = "project-1")
        val edited = original.copy(alias = "Renamed", createdAt = 2_000L)

        val updated = RemoteRepositoryStorePolicy.upsertRepository(listOf(original), edited).single()

        assertEquals("Renamed", updated.alias)
        assertEquals(1_000L, updated.createdAt)
    }

    @Test
    fun `remote repository delete removes only the local record`() {
        val first = RemoteRepositoryProfile.create(hostProfileId = "host-1", alias = "App", remotePath = "/srv/app")
        val second = RemoteRepositoryProfile.create(hostProfileId = "host-1", alias = "API", remotePath = "/srv/api")

        val remaining = RemoteRepositoryStorePolicy.deleteRepository(listOf(first, second), first.id)

        assertEquals(listOf(second), remaining)
    }

    @Test
    fun `host deletion removes associated local remote repository records`() {
        val removed = RemoteRepositoryProfile.create(hostProfileId = "host-1", alias = "App", remotePath = "/srv/app")
        val kept = RemoteRepositoryProfile.create(hostProfileId = "host-2", alias = "API", remotePath = "/srv/api")

        val remaining = RemoteRepositoryStorePolicy.deleteByHostId(listOf(removed, kept), "host-1")

        assertEquals(listOf(kept), remaining)
    }

    @Test
    fun `serialized remote repository payload excludes secret field names`() {
        val repo = RemoteRepositoryProfile.create(hostProfileId = "host-1", alias = "App", remotePath = "/srv/app")

        val payload = RemoteRepositoryCodec.encode(listOf(repo))

        assertFalse(payload.contains("passphrase", ignoreCase = true))
        assertFalse(payload.contains("password", ignoreCase = true))
        assertFalse(payload.contains("privateKey", ignoreCase = true))
        assertFalse(payload.contains("rawKey", ignoreCase = true))
        assertFalse(payload.contains("identityBytes", ignoreCase = true))
        assertFalse(payload.contains("terminal", ignoreCase = true))
        assertFalse(payload.contains("session", ignoreCase = true))
        assertFalse(payload.contains("socket", ignoreCase = true))
        assertFalse(payload.contains("tunnel", ignoreCase = true))
        assertTrue(payload.isNotBlank())
    }

    private fun encodedRecord(vararg fields: String): String = fields.joinToString(".") { field ->
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(field.toByteArray(StandardCharsets.UTF_8))
    }
}
