package com.mrongm.hobgoblin.domain.ssh

import java.util.UUID

enum class HostPortForwardBindAddress(val value: String, val label: String) {
    Loopback("127.0.0.1", "Local only"),
    AllInterfaces("0.0.0.0", "LAN");

    companion object {
        fun fromValue(value: String): HostPortForwardBindAddress =
            entries.firstOrNull { it.value == value.trim() }
                ?: throw IllegalArgumentException("Unsupported bind address")
    }
}

data class HostPortForwardRule(
    val id: String,
    val name: String,
    val localBindAddress: HostPortForwardBindAddress,
    val localPort: Int,
    val remotePort: Int,
) {
    val generatedDisplayName: String =
        "${localBindAddress.value}:$localPort -> 127.0.0.1:$remotePort"

    val displayName: String = name.ifBlank { generatedDisplayName }

    init {
        require(id.isNotBlank()) { "Port forward rule id is required" }
        require(localPort in SshHostProfile.ValidPortRange) { "Local port must be in 1..65535" }
        require(remotePort in SshHostProfile.ValidPortRange) { "Remote port must be in 1..65535" }
    }

    companion object {
        fun create(
            name: String,
            localBindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
            localPort: Int,
            remotePort: Int,
        ): HostPortForwardRule = HostPortForwardRule(
            id = UUID.randomUUID().toString(),
            name = name.trim(),
            localBindAddress = localBindAddress,
            localPort = localPort,
            remotePort = remotePort,
        )
    }
}

fun validateUniquePortForwardEndpoints(rules: List<HostPortForwardRule>) {
    val endpoints = rules.map { it.localBindAddress to it.localPort }
    require(endpoints.distinct().size == endpoints.size) {
        "Local port forward endpoints must be unique per host"
    }
}
