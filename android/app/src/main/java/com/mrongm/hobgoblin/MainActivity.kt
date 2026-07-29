package com.mrongm.hobgoblin

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.mrongm.hobgoblin.data.AndroidApplicationThemeStore
import com.mrongm.hobgoblin.data.HostProfileStore
import com.mrongm.hobgoblin.data.ManualItemOrderStore
import com.mrongm.hobgoblin.data.TerminalSettingsStore
import com.mrongm.hobgoblin.data.RemoteRepositoryStore
import com.mrongm.hobgoblin.data.TerminalSessionStore
import com.mrongm.hobgoblin.data.ssh.HostKeyStore
import com.mrongm.hobgoblin.data.ssh.SecureIdentityStore
import com.mrongm.hobgoblin.ssh.SshDiagnosticsService
import com.mrongm.hobgoblin.ssh.HostPortForwardManager
import com.mrongm.hobgoblin.ssh.SshInitializationService
import com.mrongm.hobgoblin.ssh.SshLocalPortForwardService
import com.mrongm.hobgoblin.ssh.SshjInitializationClient
import com.mrongm.hobgoblin.ssh.SshjClientFacade
import com.mrongm.hobgoblin.ssh.RemoteRepositoryGitService
import com.mrongm.hobgoblin.ssh.RemoteWorktreeService
import com.mrongm.hobgoblin.ssh.RemoteWorktreeMergeService
import com.mrongm.hobgoblin.terminals.AndroidTerminalForegroundOwner
import com.mrongm.hobgoblin.terminals.RemoteTmuxSessionService
import com.mrongm.hobgoblin.terminals.SshTerminalService
import com.mrongm.hobgoblin.terminals.TerminalForegroundBridge
import com.mrongm.hobgoblin.terminals.TerminalNavigationRequest
import com.mrongm.hobgoblin.terminals.TerminalSessionIntentExtra
import com.mrongm.hobgoblin.terminals.TerminalSessionRuntime
import com.mrongm.hobgoblin.termux.AndroidExternalTermuxEnvironment
import com.mrongm.hobgoblin.termux.ExternalTermuxLauncher
import com.mrongm.hobgoblin.ui.theme.HobgoblinTheme

class MainActivity : AppCompatActivity() {
    private val terminalNavigationRequest = mutableStateOf<TerminalNavigationRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        deliverTerminalNavigationIntent(intent)
        val hostProfileStore = HostProfileStore.create(this)
        val manualItemOrderStore = ManualItemOrderStore.create(this)
        val remoteRepositoryStore = RemoteRepositoryStore.create(this)
        val terminalSessionStore = TerminalSessionStore.create(this)
        val terminalSettingsStore = TerminalSettingsStore.create(this)
        val applicationThemeStore = AndroidApplicationThemeStore.create(this)
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
        val remoteWorktreeService = RemoteWorktreeService(
            client = SshjClientFacade(identityStore = secureIdentityStore),
            hostKeyStore = hostKeyStore,
        )
        val remoteWorktreeMergeService = RemoteWorktreeMergeService(
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
        val remoteTmuxSessionService = RemoteTmuxSessionService(
            client = SshjClientFacade(identityStore = secureIdentityStore),
            hostKeyStore = hostKeyStore,
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
            var applicationTheme by remember { mutableStateOf(applicationThemeStore.load()) }
            HobgoblinTheme(applicationTheme = applicationTheme) {
                HobgoblinAndroidApp(
                    hostProfileStore = hostProfileStore,
                    manualItemOrderStore = manualItemOrderStore,
                    remoteRepositoryStore = remoteRepositoryStore,
                    secureIdentityStore = secureIdentityStore,
                    diagnosticsService = diagnosticsService,
                    remoteRepositoryGitService = remoteRepositoryGitService,
                    remoteWorktreeService = remoteWorktreeService,
                    remoteWorktreeMergeService = remoteWorktreeMergeService,
                    terminalSettingsStore = terminalSettingsStore,
                    initializationService = initializationService,
                    terminalSessionManager = terminalManager,
                    remoteTmuxSessionService = remoteTmuxSessionService,
                    terminalForegroundBridge = terminalForegroundBridge,
                    externalTermuxLauncher = externalTermuxLauncher,
                    hostPortForwardManager = hostPortForwardManager,
                    terminalNavigationRequest = terminalNavigationRequest.value,
                    applicationTheme = applicationTheme,
                    onApplicationThemeChange = { theme ->
                        applicationThemeStore.save(theme)
                        applicationTheme = theme
                    },
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
