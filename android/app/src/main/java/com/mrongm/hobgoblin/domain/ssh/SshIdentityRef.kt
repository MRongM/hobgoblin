package com.mrongm.hobgoblin.domain.ssh

data class SshIdentityRef(
    val id: String,
    val displayName: String,
    val protectedPath: String,
    val importedAtMillis: Long,
) {
    init {
        require(id.isNotBlank()) { "Identity id is required" }
        require(displayName.isNotBlank()) { "Identity display name is required" }
        require(protectedPath.isNotBlank()) { "Identity protected path is required" }
    }
}
