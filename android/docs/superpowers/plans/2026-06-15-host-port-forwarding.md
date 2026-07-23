# Host Port Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manually controlled Host-level SSH local port forwarding for Hobgoblin Android.

**Architecture:** Persist forwarding rules on `SshHostProfile`, expose a focused manager for in-memory forwarding state, and keep SSHJ local-forwarding details behind a production service that can be tested with fakes. UI enters from the Host list and manages rules per Host without coupling forwarding to terminal sessions.

**Tech Stack:** Kotlin, Android Compose Material3, SSHJ 0.40.0, JUnit 4, existing SharedPreferences codec.

---

## Scope Check

The approved spec covers one cohesive subsystem: Host-level SSH local forwarding. The public-key duplication analysis is documentation only and is already captured in the design spec; no implementation task changes server `authorized_keys` or SSH initialization behavior.

## File Structure

- Create: `app/src/main/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRule.kt`
  - Owns forwarding rule data, bind address enum, display labels, and draft validation helpers.
- Modify: `app/src/main/java/dev/hobgoblin/android/domain/ssh/SshHostProfile.kt`
  - Adds `portForwards` and validates duplicate local endpoint rules per Host.
- Modify: `app/src/main/java/dev/hobgoblin/android/data/HostProfileStore.kt`
  - Extends `HostProfileCodec` from 7 fields to 8 fields while decoding legacy records.
- Modify: `gradle/libs.versions.toml`, `app/build.gradle.kts`
  - Adds `org.json` only for JVM unit tests because app runtime uses Android platform `org.json`.
- Create: `app/src/main/java/dev/hobgoblin/android/ssh/HostPortForwardManager.kt`
  - Owns runtime status, observers, duplicate-running checks, and lifecycle calls.
- Create: `app/src/main/java/dev/hobgoblin/android/ssh/SshLocalPortForwardService.kt`
  - Implements SSHJ local forwarding with independent SSH connections.
- Create: `app/src/main/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreen.kt`
  - Host rule list, add/edit form, bind address warning, start/stop/delete commands.
- Modify: `app/src/main/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreen.kt`
  - Adds a Ports entry point for each Host.
- Modify: `app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt`
  - Adds `HostPorts(hostId)`.
- Modify: `app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`, `app/src/main/java/dev/hobgoblin/android/MainActivity.kt`
  - Wires the manager, route, persistence, and Host deletion cleanup.
- Tests:
  - `app/src/test/java/dev/hobgoblin/android/data/HostProfileStoreTest.kt`
  - `app/src/test/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRuleTest.kt`
  - `app/src/test/java/dev/hobgoblin/android/ssh/HostPortForwardManagerTest.kt`
  - `app/src/test/java/dev/hobgoblin/android/ssh/SshLocalPortForwardServiceTest.kt`
  - `app/src/test/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreenStateTest.kt`
  - `app/src/test/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreenStateTest.kt`
  - `app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`

### Task 1: Domain Model And Host Persistence

**Files:**
- Create: `app/src/main/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRule.kt`
- Modify: `app/src/main/java/dev/hobgoblin/android/domain/ssh/SshHostProfile.kt`
- Modify: `app/src/main/java/dev/hobgoblin/android/data/HostProfileStore.kt`
- Modify: `gradle/libs.versions.toml`
- Modify: `app/build.gradle.kts`
- Test: `app/src/test/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRuleTest.kt`
- Test: `app/src/test/java/dev/hobgoblin/android/data/HostProfileStoreTest.kt`

- [ ] **Step 1: Add failing domain tests**

Create `app/src/test/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRuleTest.kt`:

```kotlin
package dev.hobgoblin.android.domain.ssh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class HostPortForwardRuleTest {
    @Test
    fun `port forward rule trims name and defaults loopback bind address`() {
        val rule = HostPortForwardRule.create(
            name = "  Web app  ",
            localPort = 8080,
            remotePort = 3000,
        )

        assertEquals("Web app", rule.name)
        assertEquals(HostPortForwardBindAddress.Loopback, rule.localBindAddress)
        assertEquals("127.0.0.1:8080 -> 127.0.0.1:3000", rule.generatedDisplayName)
    }

    @Test
    fun `bind address parses only supported local values`() {
        assertEquals(HostPortForwardBindAddress.Loopback, HostPortForwardBindAddress.fromValue("127.0.0.1"))
        assertEquals(HostPortForwardBindAddress.AllInterfaces, HostPortForwardBindAddress.fromValue("0.0.0.0"))
        assertThrows(IllegalArgumentException::class.java) {
            HostPortForwardBindAddress.fromValue("192.168.1.5")
        }
    }

    @Test
    fun `port forward rule rejects ports outside ssh range`() {
        assertThrows(IllegalArgumentException::class.java) {
            HostPortForwardRule.create(name = "", localPort = 0, remotePort = 3000)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HostPortForwardRule.create(name = "", localPort = 8080, remotePort = 65536)
        }
    }

    @Test
    fun `host rejects duplicate local endpoints within one profile`() {
        val first = HostPortForwardRule.create(name = "A", localPort = 8080, remotePort = 3000)
        val second = HostPortForwardRule.create(name = "B", localPort = 8080, remotePort = 3001)

        val error = assertThrows(IllegalArgumentException::class.java) {
            SshHostProfile.create(
                alias = "Dev",
                host = "example.com",
                user = "lee",
                portForwards = listOf(first, second),
            )
        }

        assertTrue(error.message.orEmpty().contains("Local port forward endpoints must be unique"))
    }
}
```

- [ ] **Step 2: Add failing persistence tests**

Extend `app/src/test/java/dev/hobgoblin/android/data/HostProfileStoreTest.kt` with:

```kotlin
@Test
fun `host profile port forwards round trip through serialized storage payload`() {
    val rule = HostPortForwardRule.create(
        name = "Web",
        localBindAddress = HostPortForwardBindAddress.AllInterfaces,
        localPort = 8080,
        remotePort = 3000,
    )
    val profile = SshHostProfile.create(
        alias = "Dev",
        host = "example.com",
        user = "lee",
        port = 2200,
        portForwards = listOf(rule),
    )

    val decoded = HostProfileCodec.decode(HostProfileCodec.encode(listOf(profile)))

    assertEquals(listOf(profile), decoded)
}

@Test
fun `host profile codec decodes legacy seven field payload without port forwards`() {
    val profile = SshHostProfile.create(alias = "Dev", host = "example.com", user = "lee", port = 2200)
    val legacyPayload = legacyHostPayload(profile)

    val decoded = HostProfileCodec.decode(legacyPayload)

    assertEquals(listOf(profile), decoded)
    assertEquals(emptyList<HostPortForwardRule>(), decoded.single().portForwards)
}
```

Add imports:

```kotlin
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import java.nio.charset.StandardCharsets
import java.util.Base64
```

Add helper in the test class:

```kotlin
private fun legacyHostPayload(host: SshHostProfile): String =
    listOf(
        host.id,
        host.alias.orEmpty(),
        host.host,
        host.user,
        host.port.toString(),
        host.identityRefId.orEmpty(),
        host.lastDiagnosticStatus.orEmpty(),
    ).joinToString(".") { value ->
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(value.toByteArray(StandardCharsets.UTF_8))
    }
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.domain.ssh.HostPortForwardRuleTest" --tests "dev.hobgoblin.android.data.HostProfileStoreTest"
```

Expected: compilation fails because `HostPortForwardRule`, `HostPortForwardBindAddress`, and `SshHostProfile.portForwards` do not exist.

- [ ] **Step 4: Add the model**

Create `app/src/main/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRule.kt`:

```kotlin
package dev.hobgoblin.android.domain.ssh

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
```

- [ ] **Step 5: Extend `SshHostProfile`**

Modify constructor, `init`, `create`, and `update` in `app/src/main/java/dev/hobgoblin/android/domain/ssh/SshHostProfile.kt`:

```kotlin
data class SshHostProfile(
    val id: String,
    val alias: String?,
    val host: String,
    val user: String,
    val port: Int,
    val identityRefId: String? = null,
    val lastDiagnosticStatus: String? = null,
    val portForwards: List<HostPortForwardRule> = emptyList(),
) {
    val title: String = alias?.takeIf { it.isNotBlank() } ?: "$user@$host"
    val subtitle: String = "$user@$host:$port"

    init {
        require(id.isNotBlank()) { "Host profile id is required" }
        require(host.isNotBlank()) { "Host is required" }
        require(user.isNotBlank()) { "User is required" }
        require(port in ValidPortRange) { "Port must be in 1..65535" }
        validateUniquePortForwardEndpoints(portForwards)
    }
```

Add `portForwards` to `create`:

```kotlin
fun create(
    alias: String?,
    host: String,
    user: String,
    port: Int? = null,
    identityRefId: String? = null,
    portForwards: List<HostPortForwardRule> = emptyList(),
): SshHostProfile {
    val normalizedHost = host.trim()
    val normalizedUser = user.trim()
    val normalizedAlias = alias?.trim()?.takeIf { it.isNotEmpty() }
    val normalizedPort = port ?: 22
    require(normalizedHost.isNotEmpty()) { "Host is required" }
    require(normalizedUser.isNotEmpty()) { "User is required" }
    require(normalizedPort in ValidPortRange) { "Port must be in 1..65535" }
    return SshHostProfile(
        id = UUID.randomUUID().toString(),
        alias = normalizedAlias,
        host = normalizedHost,
        user = normalizedUser,
        port = normalizedPort,
        identityRefId = identityRefId?.trim()?.takeIf { it.isNotEmpty() },
        portForwards = portForwards,
    )
}
```

Add `portForwards` to `update`:

```kotlin
fun update(
    existing: SshHostProfile,
    alias: String?,
    host: String,
    user: String,
    port: Int,
    identityRefId: String? = existing.identityRefId,
    portForwards: List<HostPortForwardRule> = existing.portForwards,
): SshHostProfile {
    val normalizedHost = host.trim()
    val normalizedUser = user.trim()
    val normalizedAlias = alias?.trim()?.takeIf { it.isNotEmpty() }
    require(normalizedHost.isNotEmpty()) { "Host is required" }
    require(normalizedUser.isNotEmpty()) { "User is required" }
    require(port in ValidPortRange) { "Port must be in 1..65535" }
    return existing.copy(
        alias = normalizedAlias,
        host = normalizedHost,
        user = normalizedUser,
        port = port,
        identityRefId = identityRefId?.trim()?.takeIf { it.isNotEmpty() },
        portForwards = portForwards,
    )
}
```

- [ ] **Step 6: Add JVM test dependency for `org.json`**

Modify `gradle/libs.versions.toml`:

```toml
json = "20250517"
```

and:

```toml
org-json = { module = "org.json:json", version.ref = "json" }
```

Modify `app/build.gradle.kts` dependencies:

```kotlin
testImplementation(libs.org.json)
```

If Gradle fails because the dependency is not cached and network is unavailable, request approval to download dependencies before continuing.

- [ ] **Step 7: Extend `HostProfileCodec`**

Modify `app/src/main/java/dev/hobgoblin/android/data/HostProfileStore.kt` imports:

```kotlin
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import org.json.JSONArray
import org.json.JSONObject
```

Modify `encode` list:

```kotlin
host.lastDiagnosticStatus.orEmpty(),
HostPortForwardRuleCodec.encode(host.portForwards),
```

Modify `decodeHost` to accept 7 or 8 fields:

```kotlin
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
```

Add below `HostProfileCodec`:

```kotlin
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
```

- [ ] **Step 8: Run domain and persistence tests**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.domain.ssh.HostPortForwardRuleTest" --tests "dev.hobgoblin.android.data.HostProfileStoreTest"
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run only after user confirms commit execution:

```bash
git add "gradle/libs.versions.toml" "app/build.gradle.kts" "app/src/main/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRule.kt" "app/src/main/java/dev/hobgoblin/android/domain/ssh/SshHostProfile.kt" "app/src/main/java/dev/hobgoblin/android/data/HostProfileStore.kt" "app/src/test/java/dev/hobgoblin/android/domain/ssh/HostPortForwardRuleTest.kt" "app/src/test/java/dev/hobgoblin/android/data/HostProfileStoreTest.kt"
git commit -m "feat: persist host port forward rules"
```

### Task 2: Port Forward Runtime Manager

**Files:**
- Create: `app/src/main/java/dev/hobgoblin/android/ssh/HostPortForwardManager.kt`
- Test: `app/src/test/java/dev/hobgoblin/android/ssh/HostPortForwardManagerTest.kt`

- [ ] **Step 1: Write failing manager tests**

Create `app/src/test/java/dev/hobgoblin/android/ssh/HostPortForwardManagerTest.kt`:

```kotlin
package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HostPortForwardManagerTest {
    @Test
    fun `start opens service and marks rule running`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service, clock = { 100L })
        val host = host()
        val rule = rule(localPort = 8080)

        val status = manager.start(host, rule)

        assertEquals(HostPortForwardStatus.Running(startedAtMillis = 100L), status)
        assertEquals(listOf("host-1:rule-8080"), service.opened)
        assertEquals(status, manager.status(rule.id))
    }

    @Test
    fun `start is idempotent for an already running rule`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val host = host()
        val rule = rule(localPort = 8080)

        manager.start(host, rule)
        val second = manager.start(host, rule)

        assertTrue(second is HostPortForwardStatus.Running)
        assertEquals(1, service.opened.size)
    }

    @Test
    fun `start rejects another running rule on the same local endpoint`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val host = host()
        val first = rule(id = "first", localPort = 8080)
        val second = rule(id = "second", localPort = 8080)

        manager.start(host, first)
        val status = manager.start(host, second)

        assertEquals(
            HostPortForwardStatus.Failed("Local port 127.0.0.1:8080 is already running"),
            status,
        )
        assertEquals(1, service.opened.size)
    }

    @Test
    fun `stop closes the running session and marks rule stopped`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val rule = rule(localPort = 8080)

        manager.start(host(), rule)
        manager.stop(rule.id)

        assertEquals(HostPortForwardStatus.Stopped, manager.status(rule.id))
        assertEquals(listOf("rule-8080"), service.closed)
    }

    @Test
    fun `stop for host closes only sessions owned by that host`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val first = rule(id = "first", localPort = 8080)
        val second = rule(id = "second", localPort = 9090)

        manager.start(host(id = "host-1"), first)
        manager.start(host(id = "host-2"), second)
        manager.stopForHost("host-1")

        assertEquals(HostPortForwardStatus.Stopped, manager.status(first.id))
        assertTrue(manager.status(second.id) is HostPortForwardStatus.Running)
        assertEquals(listOf("first"), service.closed)
    }

    @Test
    fun `observers receive status changes`() {
        val manager = HostPortForwardManager(service = FakeHostPortForwardService(), clock = { 7L })
        val observed = mutableListOf<Map<String, HostPortForwardStatus>>()
        val rule = rule(localPort = 8080)

        val observer = manager.observeStatuses { observed.add(it) }
        manager.start(host(), rule)
        manager.stop(rule.id)
        observer.close()

        assertEquals(emptyMap<String, HostPortForwardStatus>(), observed[0])
        assertEquals(HostPortForwardStatus.Running(7L), observed[1][rule.id])
        assertEquals(HostPortForwardStatus.Stopped, observed[2][rule.id])
    }

    private fun host(id: String = "host-1"): SshHostProfile =
        SshHostProfile(id = id, alias = "Dev", host = "example.com", user = "lee", port = 22, identityRefId = "identity-1")

    private fun rule(
        id: String = "rule-8080",
        localPort: Int,
        bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
    ): HostPortForwardRule =
        HostPortForwardRule(id = id, name = "Web", localBindAddress = bindAddress, localPort = localPort, remotePort = 3000)

    private class FakeHostPortForwardService : HostPortForwardService {
        val opened = mutableListOf<String>()
        val closed = mutableListOf<String>()

        override fun open(host: SshHostProfile, rule: HostPortForwardRule): HostPortForwardSession {
            opened.add("${host.id}:${rule.id}")
            return object : HostPortForwardSession {
                override val hostId: String = host.id
                override val ruleId: String = rule.id
                override val localBindAddress: HostPortForwardBindAddress = rule.localBindAddress
                override val localPort: Int = rule.localPort

                override fun close() {
                    closed.add(rule.id)
                }
            }
        }
    }
}
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ssh.HostPortForwardManagerTest"
```

Expected: compilation fails because manager and service interfaces do not exist.

- [ ] **Step 3: Implement manager**

Create `app/src/main/java/dev/hobgoblin/android/ssh/HostPortForwardManager.kt`:

```kotlin
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
```

- [ ] **Step 4: Run manager tests**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ssh.HostPortForwardManagerTest"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run only after user confirms commit execution:

```bash
git add "app/src/main/java/dev/hobgoblin/android/ssh/HostPortForwardManager.kt" "app/src/test/java/dev/hobgoblin/android/ssh/HostPortForwardManagerTest.kt"
git commit -m "feat: manage host port forward runtime state"
```

### Task 3: SSHJ Local Port Forward Service

**Files:**
- Create: `app/src/main/java/dev/hobgoblin/android/ssh/SshLocalPortForwardService.kt`
- Test: `app/src/test/java/dev/hobgoblin/android/ssh/SshLocalPortForwardServiceTest.kt`

- [ ] **Step 1: Write failing service tests**

Create `app/src/test/java/dev/hobgoblin/android/ssh/SshLocalPortForwardServiceTest.kt`:

```kotlin
package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.data.ssh.SshIdentityMaterialStore
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.domain.ssh.SshIdentityRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SshLocalPortForwardServiceTest {
    @Test
    fun `open maps selected local endpoint to remote loopback`() {
        val client = FakeSshLocalForwardClient()
        val service = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { client },
        )
        val host = host()
        val rule = rule(
            bindAddress = HostPortForwardBindAddress.AllInterfaces,
            localPort = 8080,
            remotePort = 3000,
        )

        service.open(host, rule)

        assertEquals("example.com", client.connectedHost)
        assertEquals(22, client.connectedPort)
        assertEquals("lee", client.authenticatedUser)
        assertEquals("private-key", client.identity.decodeToString())
        assertEquals("0.0.0.0", client.localHost)
        assertEquals(8080, client.localPort)
        assertEquals("127.0.0.1", client.remoteHost)
        assertEquals(3000, client.remotePort)
    }

    @Test
    fun `open rejects host without identity`() {
        val service = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { FakeSshLocalForwardClient() },
        )

        val error = assertThrows(SshLocalPortForwardException::class.java) {
            service.open(host(identityRefId = null), rule())
        }

        assertEquals("Configure an SSH identity before starting port forwarding", error.message)
    }

    @Test
    fun `open rejects untrusted host key`() {
        val service = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(trusted = false),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { FakeSshLocalForwardClient() },
        )

        val error = assertThrows(SshLocalPortForwardException::class.java) {
            service.open(host(), rule())
        }

        assertEquals("Trust this host key before starting port forwarding", error.message)
    }

    @Test
    fun `close releases forward and ssh client`() {
        val client = FakeSshLocalForwardClient()
        val session = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { client },
        ).open(host(), rule())

        session.close()

        assertEquals(listOf("forward", "client"), client.closed)
    }

    private fun host(identityRefId: String? = "identity-1"): SshHostProfile =
        SshHostProfile(id = "host-1", alias = "Dev", host = "example.com", user = "lee", port = 22, identityRefId = identityRefId)

    private fun rule(
        bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
        localPort: Int = 8080,
        remotePort: Int = 3000,
    ): HostPortForwardRule =
        HostPortForwardRule(id = "rule-1", name = "Web", localBindAddress = bindAddress, localPort = localPort, remotePort = remotePort)

    private class FakeIdentityStore : SshIdentityMaterialStore {
        override fun importPrivateKey(displayName: String, keyBytes: ByteArray): SshIdentityRef {
            throw UnsupportedOperationException("not used")
        }

        override fun loadProtectedBytesById(identityId: String): ByteArray = "private-key".toByteArray()
    }

    private class FakeTrustStore(private val trusted: Boolean = true) : HostKeyTrustStore {
        override fun evaluate(target: RemoteTarget, fingerprint: String): HostKeyTrust =
            if (trusted) HostKeyTrust.Trusted(fingerprint) else HostKeyTrust.Unknown

        override fun trust(target: RemoteTarget, fingerprint: String): HostKeyTrust.Trusted =
            HostKeyTrust.Trusted(fingerprint)
    }

    private class FakeFingerprintReader : SshHostFingerprintReader {
        override fun fetch(target: RemoteTarget): String = "SHA256:test"
    }

    private class FakeSshLocalForwardClient : SshLocalForwardClient {
        var connectedHost: String? = null
        var connectedPort: Int? = null
        var authenticatedUser: String? = null
        lateinit var identity: ByteArray
        var localHost: String? = null
        var localPort: Int? = null
        var remoteHost: String? = null
        var remotePort: Int? = null
        val closed = mutableListOf<String>()

        override fun connect(host: String, port: Int, acceptedFingerprint: String?) {
            connectedHost = host
            connectedPort = port
        }

        override fun authenticatePublicKey(user: String, identityBytes: ByteArray) {
            authenticatedUser = user
            identity = identityBytes
        }

        override fun startLocalForward(localHost: String, localPort: Int, remoteHost: String, remotePort: Int): AutoCloseable {
            this.localHost = localHost
            this.localPort = localPort
            this.remoteHost = remoteHost
            this.remotePort = remotePort
            return AutoCloseable { closed.add("forward") }
        }

        override fun close() {
            closed.add("client")
        }
    }
}
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ssh.SshLocalPortForwardServiceTest"
```

Expected: compilation fails because `SshLocalPortForwardService` and `SshLocalForwardClient` do not exist.

- [ ] **Step 3: Implement service and SSHJ client**

Create `app/src/main/java/dev/hobgoblin/android/ssh/SshLocalPortForwardService.kt`:

```kotlin
package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.data.ssh.SshIdentityMaterialStore
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import java.net.BindException
import java.net.InetSocketAddress
import java.net.ServerSocket
import kotlin.concurrent.thread
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.connection.channel.direct.Parameters
import net.schmizz.sshj.transport.verification.HostKeyVerifier

interface SshLocalForwardClient : AutoCloseable {
    fun connect(host: String, port: Int, acceptedFingerprint: String?)
    fun authenticatePublicKey(user: String, identityBytes: ByteArray)
    fun startLocalForward(localHost: String, localPort: Int, remoteHost: String, remotePort: Int): AutoCloseable
}

interface SshHostFingerprintReader {
    fun fetch(target: RemoteTarget): String
}

class SshjHostFingerprintReader : SshHostFingerprintReader {
    override fun fetch(target: RemoteTarget): String =
        SshjInitializationClient().fetchHostFingerprint(target)
}

class SshLocalPortForwardService(
    private val identityStore: SshIdentityMaterialStore,
    private val hostKeyTrustStore: HostKeyTrustStore,
    private val hostFingerprintReader: SshHostFingerprintReader = SshjHostFingerprintReader(),
    private val clientFactory: () -> SshLocalForwardClient = { SshjLocalForwardClient() },
) : HostPortForwardService {
    override fun open(host: SshHostProfile, rule: HostPortForwardRule): HostPortForwardSession {
        val identityRefId = host.identityRefId
            ?: throw SshLocalPortForwardException("Configure an SSH identity before starting port forwarding")
        val target = RemoteTarget.fromHostProfile(host)
        val fingerprint = fetchTrustedFingerprint(target)
        val identityBytes = identityStore.loadProtectedBytesById(identityRefId)
        val client = clientFactory()
        return runCatching {
            client.connect(host.host, host.port, fingerprint)
            client.authenticatePublicKey(host.user, identityBytes)
            val forward = client.startLocalForward(
                localHost = rule.localBindAddress.value,
                localPort = rule.localPort,
                remoteHost = RemoteLoopback,
                remotePort = rule.remotePort,
            )
            SshLocalPortForwardSession(
                hostId = host.id,
                ruleId = rule.id,
                localBindAddress = rule.localBindAddress,
                localPort = rule.localPort,
                forward = forward,
                client = client,
            )
        }.getOrElse { error ->
            runCatching { client.close() }
            throw mapForwardException(error, rule)
        }
    }

    private fun fetchTrustedFingerprint(target: RemoteTarget): String {
        val current = hostFingerprintReader.fetch(target)
        if (hostKeyTrustStore.evaluate(target, current) !is HostKeyTrust.Trusted) {
            throw SshLocalPortForwardException("Trust this host key before starting port forwarding")
        }
        return current
    }

    private fun mapForwardException(error: Throwable, rule: HostPortForwardRule): SshLocalPortForwardException {
        if (error is SshLocalPortForwardException) return error
        val bind = generateSequence(error) { it.cause }.firstOrNull { it is BindException }
        if (bind != null) {
            return SshLocalPortForwardException("Local port ${rule.localBindAddress.value}:${rule.localPort} is unavailable", error)
        }
        return SshLocalPortForwardException(error.message?.takeIf { it.isNotBlank() } ?: "Port forward failed", error)
    }

    private companion object {
        const val RemoteLoopback = "127.0.0.1"
    }
}

private class SshLocalPortForwardSession(
    override val hostId: String,
    override val ruleId: String,
    override val localBindAddress: HostPortForwardBindAddress,
    override val localPort: Int,
    private val forward: AutoCloseable,
    private val client: AutoCloseable,
) : HostPortForwardSession {
    override fun close() {
        runCatching { forward.close() }
        runCatching { client.close() }
    }
}

class SshjLocalForwardClient : SshLocalForwardClient {
    private val client: SSHClient = SshjClients.create()

    override fun connect(host: String, port: Int, acceptedFingerprint: String?) {
        client.addHostKeyVerifier(
            object : HostKeyVerifier {
                override fun verify(hostname: String, port: Int, key: java.security.PublicKey): Boolean {
                    val fingerprint = SshPublicKeyEncoding.fingerprint(key)
                    return acceptedFingerprint == null || acceptedFingerprint == fingerprint
                }

                override fun findExistingAlgorithms(hostname: String, port: Int): MutableList<String> = mutableListOf()
            },
        )
        client.connect(host, port)
    }

    override fun authenticatePublicKey(user: String, identityBytes: ByteArray) {
        client.authPublickey(user, SshPrivateKeys.keyProvider(client, identityBytes, passphrase = null))
    }

    override fun startLocalForward(localHost: String, localPort: Int, remoteHost: String, remotePort: Int): AutoCloseable {
        val serverSocket = ServerSocket()
        serverSocket.reuseAddress = true
        serverSocket.bind(InetSocketAddress(localHost, localPort))
        val forwarder = client.newLocalPortForwarder(
            Parameters(localHost, localPort, remoteHost, remotePort),
            serverSocket,
        )
        val listenThread = thread(name = "hobgoblin-port-forward-$localHost-$localPort", isDaemon = true) {
            runCatching { forwarder.listen() }
        }
        return AutoCloseable {
            runCatching { forwarder.close() }
            runCatching { serverSocket.close() }
            runCatching { listenThread.interrupt() }
        }
    }

    override fun close() {
        client.close()
    }
}

class SshLocalPortForwardException(
    override val message: String,
    override val cause: Throwable? = null,
) : RuntimeException(message, cause)
```

- [ ] **Step 4: Run service tests**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ssh.SshLocalPortForwardServiceTest"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run only after user confirms commit execution:

```bash
git add "app/src/main/java/dev/hobgoblin/android/ssh/SshLocalPortForwardService.kt" "app/src/test/java/dev/hobgoblin/android/ssh/SshLocalPortForwardServiceTest.kt"
git commit -m "feat: add ssh local port forward service"
```

### Task 4: Port Forward UI State And Screen

**Files:**
- Create: `app/src/main/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreen.kt`
- Test: `app/src/test/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreenStateTest.kt`

- [ ] **Step 1: Write failing UI state tests**

Create `app/src/test/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreenStateTest.kt`:

```kotlin
package dev.hobgoblin.android.ui.screens.portforwards

import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.ssh.HostPortForwardStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostPortsScreenStateTest {
    @Test
    fun `draft defaults to loopback bind address`() {
        val draft = HostPortForwardDraft()

        assertEquals(HostPortForwardBindAddress.Loopback, draft.bindAddress)
        assertFalse(shouldShowLanWarning(draft.bindAddress))
    }

    @Test
    fun `lan bind address shows warning`() {
        assertTrue(shouldShowLanWarning(HostPortForwardBindAddress.AllInterfaces))
    }

    @Test
    fun `draft validation creates trimmed rule`() {
        val result = validatePortForwardDraft(
            draft = HostPortForwardDraft(name = "  Web  ", localPort = "8080", remotePort = "3000"),
            existingRules = emptyList(),
            editingRuleId = null,
        )

        assertTrue(result is PortForwardDraftValidation.Valid)
        val rule = (result as PortForwardDraftValidation.Valid).rule
        assertEquals("Web", rule.name)
        assertEquals(8080, rule.localPort)
        assertEquals(3000, rule.remotePort)
    }

    @Test
    fun `draft validation rejects duplicate local endpoint`() {
        val existing = HostPortForwardRule.create(name = "A", localPort = 8080, remotePort = 3000)
        val result = validatePortForwardDraft(
            draft = HostPortForwardDraft(localPort = "8080", remotePort = "3001"),
            existingRules = listOf(existing),
            editingRuleId = null,
        )

        assertEquals(PortForwardDraftValidation.Invalid("Local port 127.0.0.1:8080 is already saved for this host"), result)
    }

    @Test
    fun `status label maps runtime states`() {
        assertEquals("Stopped", portForwardStatusLabel(HostPortForwardStatus.Stopped))
        assertEquals("Starting", portForwardStatusLabel(HostPortForwardStatus.Starting))
        assertEquals("Running", portForwardStatusLabel(HostPortForwardStatus.Running(1L)))
        assertEquals("Failed: denied", portForwardStatusLabel(HostPortForwardStatus.Failed("denied")))
    }
}
```

- [ ] **Step 2: Run state tests to verify failure**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.portforwards.HostPortsScreenStateTest"
```

Expected: compilation fails because screen state helpers do not exist.

- [ ] **Step 3: Implement screen state helpers and Compose screen**

Create `app/src/main/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreen.kt` with state helpers:

```kotlin
package dev.hobgoblin.android.ui.screens.portforwards

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.ssh.HostPortForwardStatus
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

data class HostPortForwardDraft(
    val name: String = "",
    val bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
    val localPort: String = "",
    val remotePort: String = "",
)

sealed interface PortForwardDraftValidation {
    data class Valid(val rule: HostPortForwardRule) : PortForwardDraftValidation
    data class Invalid(val message: String) : PortForwardDraftValidation
}

internal fun shouldShowLanWarning(bindAddress: HostPortForwardBindAddress): Boolean =
    bindAddress == HostPortForwardBindAddress.AllInterfaces

internal fun portForwardStatusLabel(status: HostPortForwardStatus): String = when (status) {
    HostPortForwardStatus.Stopped -> "Stopped"
    HostPortForwardStatus.Starting -> "Starting"
    is HostPortForwardStatus.Running -> "Running"
    is HostPortForwardStatus.Failed -> "Failed: ${status.message}"
}

internal fun validatePortForwardDraft(
    draft: HostPortForwardDraft,
    existingRules: List<HostPortForwardRule>,
    editingRuleId: String?,
): PortForwardDraftValidation {
    val localPort = draft.localPort.trim().toIntOrNull()
        ?: return PortForwardDraftValidation.Invalid("Local port must be a number")
    val remotePort = draft.remotePort.trim().toIntOrNull()
        ?: return PortForwardDraftValidation.Invalid("Remote port must be a number")
    val rule = runCatching {
        HostPortForwardRule.create(
            name = draft.name,
            localBindAddress = draft.bindAddress,
            localPort = localPort,
            remotePort = remotePort,
        )
    }.getOrElse { return PortForwardDraftValidation.Invalid(it.message ?: "Invalid port forward") }
    val duplicate = existingRules.any {
        it.id != editingRuleId && it.localBindAddress == rule.localBindAddress && it.localPort == rule.localPort
    }
    if (duplicate) {
        return PortForwardDraftValidation.Invalid("Local port ${rule.localBindAddress.value}:${rule.localPort} is already saved for this host")
    }
    return PortForwardDraftValidation.Valid(if (editingRuleId == null) rule else rule.copy(id = editingRuleId))
}
```

Add the composable below the helpers:

```kotlin
@Composable
fun HostPortsScreen(
    host: SshHostProfile,
    statuses: Map<String, HostPortForwardStatus>,
    onBack: () -> Unit,
    onSaveHost: (SshHostProfile) -> Unit,
    onStart: (HostPortForwardRule) -> Unit,
    onStop: (HostPortForwardRule) -> Unit,
) {
    var draft by remember(host.id) { mutableStateOf<HostPortForwardDraft?>(null) }
    var editingRuleId by remember(host.id) { mutableStateOf<String?>(null) }
    var error by remember(host.id) { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ports") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            Text(host.title, style = MaterialTheme.typography.titleMedium)
            Text("Remote target is fixed to 127.0.0.1 on the SSH host.", style = MaterialTheme.typography.bodyMedium)
            Button(onClick = {
                draft = HostPortForwardDraft()
                editingRuleId = null
                error = null
            }) {
                Text("Add port")
            }
            if (host.portForwards.isEmpty()) {
                Text("No ports")
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    items(host.portForwards, key = { it.id }) { rule ->
                        PortForwardRow(
                            rule = rule,
                            status = statuses[rule.id] ?: HostPortForwardStatus.Stopped,
                            onStart = { onStart(rule) },
                            onStop = { onStop(rule) },
                            onEdit = {
                                editingRuleId = rule.id
                                draft = HostPortForwardDraft(
                                    name = rule.name,
                                    bindAddress = rule.localBindAddress,
                                    localPort = rule.localPort.toString(),
                                    remotePort = rule.remotePort.toString(),
                                )
                            },
                            onDelete = {
                                onStop(rule)
                                onSaveHost(host.copy(portForwards = host.portForwards.filterNot { it.id == rule.id }))
                            },
                        )
                    }
                }
            }
            draft?.let { currentDraft ->
                PortForwardEditor(
                    draft = currentDraft,
                    error = error,
                    onDraftChange = { draft = it },
                    onCancel = {
                        draft = null
                        editingRuleId = null
                        error = null
                    },
                    onSave = {
                        when (val validation = validatePortForwardDraft(currentDraft, host.portForwards, editingRuleId)) {
                            is PortForwardDraftValidation.Invalid -> error = validation.message
                            is PortForwardDraftValidation.Valid -> {
                                val nextRules = if (editingRuleId == null) {
                                    host.portForwards + validation.rule
                                } else {
                                    host.portForwards.map { if (it.id == editingRuleId) validation.rule else it }
                                }
                                onSaveHost(host.copy(portForwards = nextRules))
                                draft = null
                                editingRuleId = null
                                error = null
                            }
                        }
                    },
                )
            }
        }
    }
}
```

Add compact row/editor composables in the same file:

```kotlin
@Composable
private fun PortForwardRow(
    rule: HostPortForwardRule,
    status: HostPortForwardStatus,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            Text(rule.displayName, style = MaterialTheme.typography.titleMedium)
            Text("Local: ${rule.localBindAddress.value}:${rule.localPort}")
            Text("Remote: 127.0.0.1:${rule.remotePort}")
            Text(portForwardStatusLabel(status), style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                if (status is HostPortForwardStatus.Running || status == HostPortForwardStatus.Starting) {
                    TextButton(onClick = onStop) { Text("Stop") }
                } else {
                    TextButton(onClick = onStart) { Text("Start") }
                }
                TextButton(onClick = onEdit) { Text("Edit") }
                TextButton(onClick = onDelete) { Text("Delete") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PortForwardEditor(
    draft: HostPortForwardDraft,
    error: String?,
    onDraftChange: (HostPortForwardDraft) -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.name,
                onValueChange = { onDraftChange(draft.copy(name = it)) },
                label = { Text("Name") },
                singleLine = true,
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.localPort,
                onValueChange = { onDraftChange(draft.copy(localPort = it)) },
                label = { Text("Local port") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
            )
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                HostPortForwardBindAddress.entries.forEachIndexed { index, address ->
                    SegmentedButton(
                        selected = draft.bindAddress == address,
                        onClick = { onDraftChange(draft.copy(bindAddress = address)) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = HostPortForwardBindAddress.entries.size,
                        ),
                    ) {
                        Text(address.label)
                    }
                }
            }
            if (shouldShowLanWarning(draft.bindAddress)) {
                Text(
                    "LAN mode exposes this phone port to devices that can reach it on the local network.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.remotePort,
                onValueChange = { onDraftChange(draft.copy(remotePort = it)) },
                label = { Text("Remote port") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
            )
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                TextButton(onClick = onCancel) { Text("Cancel") }
                Button(onClick = onSave) { Text("Save") }
            }
        }
    }
}
```

- [ ] **Step 4: Run UI state tests**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.portforwards.HostPortsScreenStateTest"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run only after user confirms commit execution:

```bash
git add "app/src/main/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreen.kt" "app/src/test/java/dev/hobgoblin/android/ui/screens/portforwards/HostPortsScreenStateTest.kt"
git commit -m "feat: add host port forwarding screen state"
```

### Task 5: Route And App Wiring

**Files:**
- Modify: `app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt`
- Modify: `app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`
- Modify: `app/src/main/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreen.kt`
- Modify: `app/src/test/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreenStateTest.kt`
- Modify: `app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Modify: `app/src/main/java/dev/hobgoblin/android/MainActivity.kt`

- [ ] **Step 1: Add failing route and Host screen tests**

Extend `AppRouteTest`:

```kotlin
@Test
fun `host ports route carries host identity`() {
    val route = AppRoute.HostPorts("host-1")

    assertEquals("host-1", route.hostId)
}
```

Extend `HostsScreenStateTest`:

```kotlin
@Test
fun `host ports are available only for saved hosts`() {
    assertTrue(canOpenHostPorts(host(lastDiagnosticStatus = null)))
}
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.navigation.AppRouteTest" --tests "dev.hobgoblin.android.ui.screens.hosts.HostsScreenStateTest"
```

Expected: compilation fails because `AppRoute.HostPorts` and `canOpenHostPorts` do not exist.

- [ ] **Step 3: Add route and Host entry point**

Modify `AppRoute.kt`:

```kotlin
data class HostPorts(val hostId: String) : AppRoute
```

Add helper in `HostsScreen.kt`:

```kotlin
internal fun canOpenHostPorts(host: SshHostProfile): Boolean = host.id.isNotBlank()
```

Modify `HostsScreen` signature:

```kotlin
onOpenPorts: (String) -> Unit,
```

Pass through `HostList` and `HostRow`, then add a button:

```kotlin
TextButton(
    enabled = canOpenHostPorts(host),
    onClick = onOpenPorts,
) {
    Text("Ports")
}
```

- [ ] **Step 4: Wire app dependencies**

Modify `HobgoblinAndroidApp` parameters:

```kotlin
hostPortForwardManager: HostPortForwardManager,
```

Add imports:

```kotlin
import dev.hobgoblin.android.ssh.HostPortForwardManager
import dev.hobgoblin.android.ssh.HostPortForwardStatus
import dev.hobgoblin.android.ui.screens.portforwards.HostPortsScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
```

Add state and observer near terminal session state:

```kotlin
var portForwardStatuses: Map<String, HostPortForwardStatus> by remember {
    mutableStateOf(hostPortForwardManager.statuses())
}

DisposableEffect(hostPortForwardManager) {
    val observer = hostPortForwardManager.observeStatuses { statuses ->
        scope.launch {
            portForwardStatuses = statuses
        }
    }
    onDispose {
        observer.close()
    }
}
```

Pass `onOpenPorts` into `HostsScreen`:

```kotlin
onOpenPorts = { hostId -> route = AppRoute.HostPorts(hostId) },
```

Modify host deletion to stop forwarding before deleting records:

```kotlin
hostPortForwardManager.stopForHost(hostId)
```

Add route branch:

```kotlin
is AppRoute.HostPorts -> {
    val host = currentHosts().firstOrNull { it.id == currentRoute.hostId }
    if (host == null) {
        route = AppRoute.Hosts
    } else {
        HostPortsScreen(
            host = host,
            statuses = portForwardStatuses,
            onBack = { route = AppRoute.Hosts },
            onSaveHost = { updated ->
                hostProfileStore.saveHost(updated)
                reloadHosts()
            },
            onStart = { rule ->
                scope.launch {
                    withContext(Dispatchers.IO) {
                        hostPortForwardManager.start(host, rule)
                    }
                }
            },
            onStop = { rule ->
                hostPortForwardManager.stop(rule.id)
            },
        )
    }
}
```

Modify `MainActivity.kt` imports:

```kotlin
import dev.hobgoblin.android.ssh.HostPortForwardManager
import dev.hobgoblin.android.ssh.SshLocalPortForwardService
```

Instantiate after `hostKeyStore`:

```kotlin
val hostPortForwardManager = HostPortForwardManager(
    service = SshLocalPortForwardService(
        identityStore = secureIdentityStore,
        hostKeyTrustStore = hostKeyStore,
    ),
)
```

Pass into `HobgoblinAndroidApp`:

```kotlin
hostPortForwardManager = hostPortForwardManager,
```

- [ ] **Step 5: Run route and host tests**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.navigation.AppRouteTest" --tests "dev.hobgoblin.android.ui.screens.hosts.HostsScreenStateTest"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run only after user confirms commit execution:

```bash
git add "app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt" "app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt" "app/src/main/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreen.kt" "app/src/test/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreenStateTest.kt" "app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt" "app/src/main/java/dev/hobgoblin/android/MainActivity.kt"
git commit -m "feat: wire host port forwarding UI"
```

### Task 6: Full Verification And Design Trace

**Files:**
- Modify: no production files unless verification exposes an implementation defect.
- Test: all tests touched above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.domain.ssh.HostPortForwardRuleTest" --tests "dev.hobgoblin.android.data.HostProfileStoreTest" --tests "dev.hobgoblin.android.ssh.HostPortForwardManagerTest" --tests "dev.hobgoblin.android.ssh.SshLocalPortForwardServiceTest" --tests "dev.hobgoblin.android.ui.screens.portforwards.HostPortsScreenStateTest" --tests "dev.hobgoblin.android.ui.screens.hosts.HostsScreenStateTest" --tests "dev.hobgoblin.android.navigation.AppRouteTest"
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
./gradlew :app:testDebugUnitTest
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./gradlew :app:assembleDebug
```

Expected: PASS and debug APK generated under `app/build/outputs/apk/debug/`.

- [ ] **Step 4: Inspect git diff for scope**

Run:

```bash
git status --short
git diff --stat
```

Expected: changed files are limited to domain SSH model, Host persistence, port-forward runtime, Host/port-forward UI, app wiring, Gradle test dependency, and tests.

- [ ] **Step 5: Commit verification fixes**

If Step 1 through Step 4 required fixes, commit only the verified fix files after user confirms commit execution:

```bash
git add "app/src/main/java" "app/src/test/java" "app/build.gradle.kts" "gradle/libs.versions.toml"
git commit -m "fix: verify host port forwarding integration"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage:
  - Host-level persisted rules: Task 1.
  - Manual start/stop lifecycle: Task 2, Task 4, Task 5.
  - `127.0.0.1` and `0.0.0.0` local bind addresses with default loopback: Task 1, Task 4.
  - Fixed remote `127.0.0.1:<remotePort>`: Task 3.
  - Independent SSH connection, terminal-independent lifecycle: Task 2, Task 3.
  - Host deletion cleanup: Task 5.
  - Public key duplication: intentionally design-document only, no implementation task.
- Placeholder scan: no deferred implementation labels are used as requirements.
- Type consistency:
  - `HostPortForwardRule`, `HostPortForwardBindAddress`, `HostPortForwardStatus`, `HostPortForwardManager`, `HostPortForwardService`, and `HostPortsScreen` names are consistent across tasks.
  - `AppRoute.HostPorts(hostId)` is used consistently in tests and app wiring.
