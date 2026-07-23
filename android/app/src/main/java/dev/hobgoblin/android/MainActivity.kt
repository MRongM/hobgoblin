package dev.hobgoblin.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import dev.hobgoblin.android.data.HostProfileStore
import dev.hobgoblin.android.data.TerminalSettingsStore
import dev.hobgoblin.android.data.RemoteRepositoryStore
import dev.hobgoblin.android.data.TerminalSessionStore
import dev.hobgoblin.android.data.ssh.HostKeyStore
import dev.hobgoblin.android.data.ssh.SecureIdentityStore
import dev.hobgoblin.android.ssh.SshDiagnosticsService
import dev.hobgoblin.android.ssh.HostPortForwardManager
import dev.hobgoblin.android.ssh.SshInitializationService
import dev.hobgoblin.android.ssh.SshLocalPortForwardService
import dev.hobgoblin.android.ssh.SshjInitializationClient
import dev.hobgoblin.android.ssh.SshjClientFacade
import dev.hobgoblin.android.ssh.RemoteBranchService
import dev.hobgoblin.android.ssh.RemoteRepositoryGitService
import dev.hobgoblin.android.ssh.RemoteWorktreeService
import dev.hobgoblin.android.terminals.AndroidTerminalForegroundOwner
import dev.hobgoblin.android.terminals.SshTerminalService
import dev.hobgoblin.android.terminals.TerminalForegroundBridge
import dev.hobgoblin.android.terminals.TerminalNavigationRequest
import dev.hobgoblin.android.terminals.TerminalSessionIntentExtra
import dev.hobgoblin.android.terminals.TerminalSessionRuntime
import dev.hobgoblin.android.termux.AndroidExternalTermuxEnvironment
import dev.hobgoblin.android.termux.ExternalTermuxLauncher
import dev.hobgoblin.android.ui.theme.HobgoblinTheme

class MainActivity : ComponentActivity() {
    private val terminalNavigationRequest = mutableStateOf<TerminalNavigationRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        deliverTerminalNavigationIntent(intent)
        val hostProfileStore = HostProfileStore.create(this)
        val remoteRepositoryStore = RemoteRepositoryStore.create(this)
        val terminalSessionStore = TerminalSessionStore.create(this)
        val terminalSettingsStore = TerminalSettingsStore.create(this)
        val secureIdentityStore = SecureIdentityStore.create(this)
        val hostKeyStore = HostKeyStore.create(this)
        val hostPortForwardManager = HostPortForwardManager(
            service = SshLocalPortForwardService(
                identityStore = secureIdentityStore,
                hostKeyTrustStore = hostKeyStore,
            ),
        )
        val diagnosticsService = SshDiagnosticsService(
            client = SshjClientFacade(identityStore = secureIdentityStore),
            hostKeyStore = hostKeyStore,
        )
        val remoteRepositoryGitService = RemoteRepositoryGitService(
            client = SshjClientFacade(identityStore = secureIdentityStore),
            hostKeyStore = hostKeyStore,
        )
        val remoteBranchService = RemoteBranchService(
            client = SshjClientFacade(identityStore = secureIdentityStore),
            hostKeyStore = hostKeyStore,
        )
        val remoteWorktreeService = RemoteWorktreeService(
            client = SshjClientFacade(identityStore = secureIdentityStore),
            hostKeyStore = hostKeyStore,
        )
        val initializationService = SshInitializationService(
            identityStore = secureIdentityStore,
            hostKeyStore = hostKeyStore,
            client = SshjInitializationClient(),
        )
        val terminalService = SshTerminalService(
            identityStore = secureIdentityStore,
            hostKeyTrustStore = hostKeyStore,
            keepAliveIntervalSeconds = terminalSettingsStore::loadKeepAliveIntervalSeconds,
        )
        val terminalManager = TerminalSessionRuntime.manager(
            terminalService = terminalService,
            sessionStore = terminalSessionStore,
            heartbeatIntervalSeconds = terminalSettingsStore::loadKeepAliveIntervalSeconds,
            heartbeatFailureThreshold = terminalSettingsStore::loadHeartbeatFailureThreshold,
        )
        val terminalForegroundBridge = TerminalForegroundBridge(
            manager = terminalManager,
            owner = AndroidTerminalForegroundOwner(this),
        )
        val externalTermuxLauncher = ExternalTermuxLauncher(
            AndroidExternalTermuxEnvironment(this),
        )
        setContent {
            HobgoblinTheme {
                HobgoblinAndroidApp(
                    hostProfileStore = hostProfileStore,
                    remoteRepositoryStore = remoteRepositoryStore,
                    secureIdentityStore = secureIdentityStore,
                    diagnosticsService = diagnosticsService,
                    remoteRepositoryGitService = remoteRepositoryGitService,
                    remoteBranchService = remoteBranchService,
                    remoteWorktreeService = remoteWorktreeService,
                    terminalSettingsStore = terminalSettingsStore,
                    initializationService = initializationService,
                    terminalSessionManager = terminalManager,
                    terminalForegroundBridge = terminalForegroundBridge,
                    externalTermuxLauncher = externalTermuxLauncher,
                    hostPortForwardManager = hostPortForwardManager,
                    terminalNavigationRequest = terminalNavigationRequest.value,
                )
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliverTerminalNavigationIntent(intent)
    }

    private fun deliverTerminalNavigationIntent(intent: android.content.Intent?) {
        val sessionId = intent?.getStringExtra(TerminalSessionIntentExtra) ?: return
        val nextSequence = (terminalNavigationRequest.value?.sequence ?: 0L) + 1L
        terminalNavigationRequest.value = TerminalNavigationRequest(
            sessionId = sessionId,
            sequence = nextSequence,
        )
    }
}
