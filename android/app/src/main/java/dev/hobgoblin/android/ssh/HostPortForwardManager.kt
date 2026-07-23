package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import java.util.UUID

sealed interface HostPortForwardStatus {
    data object Stopped : HostPortForwardStatus
    data object Starting : HostPortForwardStatus
    data class Running(val startedAtMillis: Long) : HostPortForwardStatus
    data class Failed(val message: String) : HostPortForwardStatus
}

interface HostPortForwardSession : AutoCloseable {
    val hostId: String
    val ruleId: String
    val localBindAddress: HostPortForwardBindAddress
    val localPort: Int
}

interface HostPortForwardService {
    fun open(host: SshHostProfile, rule: HostPortForwardRule): HostPortForwardSession
}

class HostPortForwardManager(
    private val service: HostPortForwardService,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val lock = Any()
    private val sessions = linkedMapOf<String, HostPortForwardSession>()
    private val statuses = linkedMapOf<String, HostPortForwardStatus>()
    private val observers = linkedMapOf<String, (Map<String, HostPortForwardStatus>) -> Unit>()

    fun start(host: SshHostProfile, rule: HostPortForwardRule): HostPortForwardStatus {
        synchronized(lock) {
            val existing = statuses[rule.id]
            if (existing is HostPortForwardStatus.Running || existing == HostPortForwardStatus.Starting) {
                return existing
            }
            sessions.values.firstOrNull {
                it.localBindAddress == rule.localBindAddress && it.localPort == rule.localPort
            }?.let {
                val failed = HostPortForwardStatus.Failed(
                    "Local port ${rule.localBindAddress.value}:${rule.localPort} is already running",
                )
                statuses[rule.id] = failed
                notifyObserversLocked()
                return failed
            }
            statuses[rule.id] = HostPortForwardStatus.Starting
            notifyObserversLocked()
        }

        return runCatching {
            service.open(host, rule)
        }.fold(
            onSuccess = { session ->
                synchronized(lock) {
                    sessions[rule.id] = session
                    val running = HostPortForwardStatus.Running(clock())
                    statuses[rule.id] = running
                    notifyObserversLocked()
                    running
                }
            },
            onFailure = { error ->
                synchronized(lock) {
                    val failed = HostPortForwardStatus.Failed(error.message?.takeIf { it.isNotBlank() } ?: "Port forward failed")
                    statuses[rule.id] = failed
                    notifyObserversLocked()
                    failed
                }
            },
        )
    }

    fun stop(ruleId: String) {
        val session = synchronized(lock) {
            statuses[ruleId] = HostPortForwardStatus.Stopped
            sessions.remove(ruleId)
        }
        runCatching { session?.close() }
        synchronized(lock) {
            notifyObserversLocked()
        }
    }

    fun stopForHost(hostId: String) {
        val ruleIds = synchronized(lock) {
            sessions.values.filter { it.hostId == hostId }.map { it.ruleId }
        }
        ruleIds.forEach(::stop)
    }

    fun status(ruleId: String): HostPortForwardStatus = synchronized(lock) {
        statuses[ruleId] ?: HostPortForwardStatus.Stopped
    }

    fun statuses(): Map<String, HostPortForwardStatus> = synchronized(lock) {
        statuses.toMap()
    }

    fun observeStatuses(onChanged: (Map<String, HostPortForwardStatus>) -> Unit): AutoCloseable {
        val observerId = UUID.randomUUID().toString()
        val current = synchronized(lock) {
            observers[observerId] = onChanged
            statuses.toMap()
        }
        onChanged(current)
        return AutoCloseable {
            synchronized(lock) {
                observers.remove(observerId)
            }
        }
    }

    private fun notifyObserversLocked() {
        val snapshot = statuses.toMap()
        observers.values.forEach { observer -> observer(snapshot) }
    }
}
