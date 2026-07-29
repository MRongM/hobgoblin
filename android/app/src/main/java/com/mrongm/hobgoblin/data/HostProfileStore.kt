package com.mrongm.hobgoblin.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.mrongm.hobgoblin.domain.ssh.HostPortForwardBindAddress
import com.mrongm.hobgoblin.domain.ssh.HostPortForwardRule
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import java.nio.charset.StandardCharsets
import java.util.Base64
import org.json.JSONArray
import org.json.JSONObject

class HostProfileStore private constructor(
    private val preferences: SharedPreferences,
) {
    fun loadHosts(): List<SshHostProfile> = HostProfileCodec.decode(preferences.getString(KeyHosts, "").orEmpty())

    fun saveHost(hostProfile: SshHostProfile): SshHostProfile {
        val next = HostProfileStorePolicy.upsertHost(loadHosts(), hostProfile)
        preferences.edit { putString(KeyHosts, HostProfileCodec.encode(next)) }
        return hostProfile
    }

    fun deleteHost(hostProfileId: String) {
        val next = HostProfileStorePolicy.deleteHost(loadHosts(), hostProfileId)
        preferences.edit { putString(KeyHosts, HostProfileCodec.encode(next)) }
    }

    companion object {
        private const val PreferencesName = "hobgoblin-host-profiles"
        private const val KeyHosts = "hosts"

        fun create(context: Context): HostProfileStore =
            HostProfileStore(context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE))
    }
}

object HostProfileStorePolicy {
    fun upsertHost(hosts: List<SshHostProfile>, hostProfile: SshHostProfile): List<SshHostProfile> =
        hosts.filterNot { it.id == hostProfile.id } + hostProfile

    fun deleteHost(hosts: List<SshHostProfile>, hostProfileId: String): List<SshHostProfile> =
        hosts.filterNot { it.id == hostProfileId }
}

object HostProfileCodec {
    private const val FieldSeparator = "."
    private const val RecordSeparator = "\n"

    fun encode(hosts: List<SshHostProfile>): String = hosts.joinToString(RecordSeparator) { host ->
        listOf(
            host.id,
            host.alias.orEmpty(),
            host.host,
            host.user,
            host.port.toString(),
            host.identityRefId.orEmpty(),
            host.lastDiagnosticStatus.orEmpty(),
            HostPortForwardRuleCodec.encode(host.portForwards),
        ).joinToString(FieldSeparator) { it.encodeField() }
    }

    fun decode(payload: String): List<SshHostProfile> {
        if (payload.isBlank()) return emptyList()
        return payload.lineSequence()
            .filter { it.isNotBlank() }
            .mapNotNull(::decodeHost)
            .toList()
    }

    private fun decodeHost(line: String): SshHostProfile? {
        val fields = line.split(FieldSeparator).map { it.decodeField() }
        if (fields.size != 7 && fields.size != 8) return null
        val port = fields[4].toIntOrNull() ?: return null
        return runCatching {
            SshHostProfile(
                id = fields[0],
                alias = fields[1].takeIf { it.isNotBlank() },
                host = fields[2],
                user = fields[3],
                port = port,
                identityRefId = fields[5].takeIf { it.isNotBlank() },
                lastDiagnosticStatus = fields[6].takeIf { it.isNotBlank() },
                portForwards = fields.getOrNull(7)?.let(HostPortForwardRuleCodec::decode).orEmpty(),
            )
        }.getOrNull()
    }

    private fun String.encodeField(): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(toByteArray(StandardCharsets.UTF_8))

    private fun String.decodeField(): String =
        String(Base64.getUrlDecoder().decode(this), StandardCharsets.UTF_8)
}

internal object HostPortForwardRuleCodec {
    private const val FieldId = "id"
    private const val FieldName = "name"
    private const val FieldLocalBindAddress = "localBindAddress"
    private const val FieldLocalPort = "localPort"
    private const val FieldRemotePort = "remotePort"

    fun encode(rules: List<HostPortForwardRule>): String {
        val array = JSONArray()
        rules.forEach { rule ->
            array.put(
                JSONObject()
                    .put(FieldId, rule.id)
                    .put(FieldName, rule.name)
                    .put(FieldLocalBindAddress, rule.localBindAddress.value)
                    .put(FieldLocalPort, rule.localPort)
                    .put(FieldRemotePort, rule.remotePort),
            )
        }
        return array.toString()
    }

    fun decode(payload: String): List<HostPortForwardRule> {
        if (payload.isBlank()) return emptyList()
        val array = JSONArray(payload)
        return (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            HostPortForwardRule(
                id = item.getString(FieldId),
                name = item.optString(FieldName, "").trim(),
                localBindAddress = HostPortForwardBindAddress.fromValue(item.getString(FieldLocalBindAddress)),
                localPort = item.getInt(FieldLocalPort),
                remotePort = item.getInt(FieldRemotePort),
            )
        }
    }
}
