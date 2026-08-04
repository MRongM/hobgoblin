package com.mrongm.hobgoblin.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import java.nio.charset.StandardCharsets
import java.util.Base64

class RemoteRepositoryStore private constructor(
    private val preferences: SharedPreferences,
) {
    fun loadRepositories(): List<RemoteRepositoryProfile> =
        RemoteRepositoryCodec.decode(preferences.getString(KeyRepositories, "").orEmpty())

    fun saveRepository(repository: RemoteRepositoryProfile): RemoteRepositoryProfile {
        val next = RemoteRepositoryStorePolicy.upsertRepository(loadRepositories(), repository)
        preferences.edit { putString(KeyRepositories, RemoteRepositoryCodec.encode(next)) }
        return repository
    }

    fun deleteRepository(repositoryId: String) {
        val next = RemoteRepositoryStorePolicy.deleteRepository(loadRepositories(), repositoryId)
        preferences.edit { putString(KeyRepositories, RemoteRepositoryCodec.encode(next)) }
    }

    fun deleteByHostId(hostProfileId: String) {
        val next = RemoteRepositoryStorePolicy.deleteByHostId(loadRepositories(), hostProfileId)
        preferences.edit { putString(KeyRepositories, RemoteRepositoryCodec.encode(next)) }
    }

    companion object {
        private const val PreferencesName = "hobgoblin-remote-repositories"
        private const val KeyRepositories = "repositories"

        fun create(context: Context): RemoteRepositoryStore =
            RemoteRepositoryStore(context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE))
    }
}

object RemoteRepositoryStorePolicy {
    fun upsertRepository(
        repositories: List<RemoteRepositoryProfile>,
        repository: RemoteRepositoryProfile,
    ): List<RemoteRepositoryProfile> {
        val existing = repositories.firstOrNull { it.id == repository.id }
        val storedRepository = existing?.let { repository.copy(createdAt = it.createdAt) } ?: repository
        return repositories.filterNot { it.id == repository.id } + storedRepository
    }

    fun deleteRepository(
        repositories: List<RemoteRepositoryProfile>,
        repositoryId: String,
    ): List<RemoteRepositoryProfile> = repositories.filterNot { it.id == repositoryId }

    fun deleteByHostId(
        repositories: List<RemoteRepositoryProfile>,
        hostProfileId: String,
    ): List<RemoteRepositoryProfile> = repositories.filterNot { it.hostProfileId == hostProfileId }
}

object RemoteRepositoryCodec {
    private const val FieldSeparator = "."
    private const val RecordSeparator = "\n"

    fun encode(repositories: List<RemoteRepositoryProfile>): String =
        repositories.joinToString(RecordSeparator) { repository ->
            buildList {
                add(repository.id)
                add(repository.hostProfileId)
                add(repository.alias.orEmpty())
                add(repository.remotePath)
                add(repository.kind.storageValue)
                repository.createdAt?.let { add(it.toString()) }
            }.joinToString(FieldSeparator) { it.encodeField() }
        }

    fun decode(payload: String): List<RemoteRepositoryProfile> {
        if (payload.isBlank()) return emptyList()
        return payload.lineSequence()
            .filter { it.isNotBlank() }
            .mapNotNull(::decodeRepository)
            .toList()
    }

    private fun decodeRepository(line: String): RemoteRepositoryProfile? {
        val fields = line.split(FieldSeparator).map { it.decodeField() }
        if (fields.size !in 4..6) return null
        val kind = if (fields.size == 4) {
            RemoteProjectKind.GitRepository
        } else {
            RemoteProjectKind.fromStorageValue(fields[4]) ?: return null
        }
        val createdAt = fields.getOrNull(5)?.toLongOrNull()
        if (fields.size == 6 && createdAt == null) return null
        return runCatching {
            RemoteRepositoryProfile(
                id = fields[0],
                hostProfileId = fields[1],
                alias = fields[2].takeIf { it.isNotBlank() },
                remotePath = fields[3],
                kind = kind,
                createdAt = createdAt,
            )
        }.getOrNull()
    }

    private fun String.encodeField(): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(toByteArray(StandardCharsets.UTF_8))

    private fun String.decodeField(): String =
        String(Base64.getUrlDecoder().decode(this), StandardCharsets.UTF_8)
}
