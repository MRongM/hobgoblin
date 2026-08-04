package com.mrongm.hobgoblin.domain.ssh

import java.util.UUID

enum class RemoteProjectKind(val storageValue: String) {
    GitRepository("git"),
    PlainWorkspace("plain"),
    ;

    companion object {
        fun fromStorageValue(value: String): RemoteProjectKind? =
            entries.firstOrNull { it.storageValue == value }
    }
}

data class RemoteRepositoryProfile(
    val id: String,
    val hostProfileId: String,
    val alias: String?,
    val remotePath: String,
    val kind: RemoteProjectKind = RemoteProjectKind.GitRepository,
    val createdAt: Long? = null,
) {
    val title: String = alias?.takeIf { it.isNotBlank() } ?: remotePath
    val isGitRepository: Boolean = kind == RemoteProjectKind.GitRepository

    init {
        require(id.isNotBlank()) { "Remote repository id is required" }
        require(hostProfileId.isNotBlank()) { "Host profile id is required" }
        require(remotePath.startsWith("/")) { "Remote path must be absolute" }
        require(createdAt == null || createdAt > 0L) { "Project created time must be positive" }
    }

    companion object {
        fun create(
            hostProfileId: String,
            alias: String?,
            remotePath: String,
            kind: RemoteProjectKind = RemoteProjectKind.GitRepository,
            createdAt: Long = System.currentTimeMillis(),
        ): RemoteRepositoryProfile {
            val normalizedHostProfileId = hostProfileId.trim()
            val normalizedAlias = alias?.trim()?.takeIf { it.isNotEmpty() }
            val normalizedRemotePath = remotePath.trim()
            require(normalizedHostProfileId.isNotEmpty()) { "Host profile id is required" }
            require(normalizedRemotePath.startsWith("/")) { "Remote path must be absolute" }
            return RemoteRepositoryProfile(
                id = UUID.randomUUID().toString(),
                hostProfileId = normalizedHostProfileId,
                alias = normalizedAlias,
                remotePath = normalizedRemotePath,
                kind = kind,
                createdAt = createdAt,
            )
        }
    }
}
