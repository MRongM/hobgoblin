package com.mrongm.hobgoblin.ui.screens.terminals

import android.view.KeyEvent
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionState
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TerminalDisconnectedReason
import com.mrongm.hobgoblin.ui.text.LocalizedText
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalInteractionStateTest {
    @Test
    fun `input is unavailable until terminal is connected`() {
        assertFalse(terminalInputAvailable(TerminalSessionState.Idle))
        assertFalse(terminalInputAvailable(TerminalSessionState.Connecting))
        assertFalse(
            terminalInputAvailable(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.AndroidServiceStopped,
                ),
            ),
        )
        assertTrue(terminalInputAvailable(TerminalSessionState.Connected("session-1", "", 80, 24)))
    }

    @Test
    fun `reconnect is available only after terminal is inactive`() {
        assertTrue(terminalReconnectAvailable(TerminalSessionState.Idle))
        assertTrue(terminalReconnectAvailable(TerminalSessionState.Exited("session-1")))
        assertTrue(terminalReconnectAvailable(TerminalSessionState.Failed("lost")))
        assertFalse(terminalReconnectAvailable(TerminalSessionState.Connecting))
        assertFalse(terminalReconnectAvailable(TerminalSessionState.Connected("session-1", "", 80, 24)))
    }

    @Test
    fun `retained terminal item reconnect is available only for inactive records`() {
        val record = TerminalSessionRecord(
            id = "session-1",
            hostId = "host-1",
            repositoryId = "repo-1",
            remotePath = "/srv/app",
            targetLabel = "App - /srv/app",
            status = TerminalSessionStatus.Starting,
            openedAt = 100L,
        )

        assertFalse(terminalSessionReconnectAvailable(record))
        assertFalse(terminalSessionReconnectAvailable(record.copy(status = TerminalSessionStatus.Running)))
        assertTrue(terminalSessionReconnectAvailable(record.copy(status = TerminalSessionStatus.Exited)))
        assertTrue(terminalSessionReconnectAvailable(record.copy(status = TerminalSessionStatus.Failed)))
        assertTrue(terminalSessionReconnectAvailable(record.copy(status = TerminalSessionStatus.Disconnected)))
    }

    @Test
    fun `terminal detail inline actions keep close visible and enable reconnect only when available`() {
        assertEquals(
            TerminalDetailInlineActions(reconnectEnabled = true, closeEnabled = true),
            terminalDetailInlineActions(TerminalSessionState.Exited("session-1")),
        )
        assertEquals(
            TerminalDetailInlineActions(reconnectEnabled = false, closeEnabled = true),
            terminalDetailInlineActions(TerminalSessionState.Connected("session-1", "", 80, 24)),
        )
    }

    @Test
    fun `terminal close confirmation explains that the session will stop`() {
        val text = terminalCloseConfirmationText("App - /srv/app")

        assertEquals(R.string.terminal_close_confirmation, text.resourceId)
        assertEquals(listOf("App - /srv/app"), text.formatArgs)
    }

    @Test
    fun `unavailable input state explains why send is disabled`() {
        assertEquals(LocalizedText(R.string.terminal_connecting_message), terminalInputUnavailableText(TerminalSessionState.Connecting))
        assertEquals(
            LocalizedText(R.string.terminal_disconnected_general),
            terminalInputUnavailableText(TerminalSessionState.Exited("session-1")),
        )
        assertEquals(
            LocalizedText(
                R.string.terminal_disconnected_detail,
                listOf(LocalizedText(R.string.terminal_reason_android_service_stopped)),
            ),
            terminalInputUnavailableText(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.AndroidServiceStopped,
                ),
            ),
        )
        assertEquals(
            LocalizedText(
                R.string.terminal_disconnected_detail,
                listOf(
                    LocalizedText(
                        R.string.terminal_status_with_detail,
                        listOf(LocalizedText(R.string.terminal_reason_ssh_disconnected), "connection lost"),
                    ),
                ),
            ),
            terminalInputUnavailableText(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.SshDisconnected,
                    message = "connection lost",
                ),
            ),
        )
        assertNull(terminalInputUnavailableText(TerminalSessionState.Connected("session-1", "", 80, 24)))
    }

    @Test
    fun `viewport keeps output while banner carries disconnect reason`() {
        val disconnected = TerminalSessionState.Disconnected(
            sessionId = "session-1",
            reason = TerminalDisconnectedReason.AndroidServiceStopped,
            output = "last output",
        )

        assertEquals("last output", terminalViewportText(disconnected))
        assertEquals(
            LocalizedText(
                R.string.terminal_disconnected_detail,
                listOf(LocalizedText(R.string.terminal_reason_android_service_stopped)),
            ),
            terminalSessionBannerText(disconnected),
        )
    }

    @Test
    fun `connecting shows banner without replacing viewport buffer`() {
        assertEquals("", terminalViewportText(TerminalSessionState.Connecting))
        assertEquals(LocalizedText(R.string.terminal_banner_connecting), terminalSessionBannerText(TerminalSessionState.Connecting))
    }

    @Test
    fun `display text combines viewport and banner for compatibility`() {
        val text = terminalDisplayText(
            TerminalSessionState.Disconnected(
                sessionId = "session-1",
                reason = TerminalDisconnectedReason.AndroidServiceStopped,
                output = "last output",
            ),
            "Terminal disconnected: Android service stopped. Reconnect or edit the host.",
        )

        assertTrue(text.contains("last output"))
        assertTrue(text.contains("disconnected", ignoreCase = true))
        assertTrue(text.contains("Android service stopped"))
    }

    @Test
    fun `viewport banner shows transient notices inside terminal viewport`() {
        assertEquals(
            "Copied.",
            terminalViewportBannerMessage(
                sessionBanner = null,
                notice = "Copied.",
            ),
        )
    }

    @Test
    fun `viewport banner keeps session state visible when transient notice exists`() {
        val disconnected = TerminalSessionState.Disconnected(
            sessionId = "session-1",
            reason = TerminalDisconnectedReason.AndroidServiceStopped,
        )

        assertEquals(
            "Copy failed.\nTerminal disconnected: Android service stopped. Reconnect or edit the host.",
            terminalViewportBannerMessage(
                sessionBanner = "Terminal disconnected: Android service stopped. Reconnect or edit the host.",
                notice = "Copy failed.",
            ),
        )
    }

    @Test
    fun `viewport banner does not duplicate matching transient and session messages`() {
        val disconnected = TerminalSessionState.Disconnected(
            sessionId = "session-1",
            reason = TerminalDisconnectedReason.AndroidServiceStopped,
        )
        val message = "Terminal disconnected: Android service stopped. Reconnect or edit the host."

        assertEquals(
            message,
            terminalViewportBannerMessage(
                sessionBanner = message,
                notice = message,
            ),
        )
    }

    @Test
    fun `terminal status label includes disconnected reason`() {
        assertEquals(
            LocalizedText(
                R.string.terminal_status_with_detail,
                listOf(
                    LocalizedText(R.string.terminal_status_disconnected),
                    LocalizedText(R.string.terminal_reason_android_service_stopped),
                ),
            ),
            terminalSessionStatusText(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.AndroidServiceStopped,
                ),
            ),
        )
        assertEquals(
            LocalizedText(
                R.string.terminal_status_with_detail,
                listOf(
                    LocalizedText(R.string.terminal_status_disconnected),
                    LocalizedText(
                        R.string.terminal_status_with_detail,
                        listOf(LocalizedText(R.string.terminal_reason_ssh_disconnected), "connection lost"),
                    ),
                ),
            ),
            terminalSessionStatusText(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.SshDisconnected,
                    message = "connection lost",
                ),
            ),
        )
        assertEquals(
            LocalizedText(R.string.terminal_status_connected),
            terminalSessionStatusText(TerminalSessionState.Connected("session-1", "", 80, 24)),
        )
    }

    @Test
    fun `command input is enabled only while terminal is connected`() {
        assertTrue(terminalCommandInputEnabled(TerminalSessionState.Connected("session-1", "", 80, 24)))
        assertFalse(
            terminalCommandInputEnabled(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.SshDisconnected,
                ),
            ),
        )
    }

    @Test
    fun `command input placeholder explains disabled state`() {
        assertEquals(
            LocalizedText(R.string.terminal_type_command),
            terminalCommandInputPlaceholderText(TerminalSessionState.Connected("session-1", "", 80, 24)),
        )
        assertEquals(
            LocalizedText(
                R.string.terminal_disconnected_detail,
                listOf(LocalizedText(R.string.terminal_reason_ssh_disconnected)),
            ),
            terminalCommandInputPlaceholderText(
                TerminalSessionState.Disconnected(
                    sessionId = "session-1",
                    reason = TerminalDisconnectedReason.SshDisconnected,
                ),
            ),
        )
    }

    @Test
    fun `command input is hidden by default`() {
        assertFalse(TerminalCommandInputDefaultVisible)
    }

    @Test
    fun `command input visibility menu label reflects state`() {
        assertEquals(
            LocalizedText(R.string.terminal_show_command_input),
            terminalCommandInputVisibilityActionText(visible = false),
        )
        assertEquals(
            LocalizedText(R.string.terminal_hide_command_input),
            terminalCommandInputVisibilityActionText(visible = true),
        )
    }

    @Test
    fun `terminal command controls stay compact`() {
        assertTrue(TerminalCommandInputHeight.value <= 40f)
        assertTrue(TerminalActionButtonHeight.value <= 36f)
    }

    @Test
    fun `native terminal fallback is visible only without emulator controller`() {
        assertTrue(terminalFallbackVisible(hasEmulatorController = false))
        assertFalse(terminalFallbackVisible(hasEmulatorController = true))
    }

    @Test
    fun `line input uses carriage return for PTY enter`() {
        assertEquals("pwd\r", terminalLineInput("pwd"))
    }

    @Test
    fun `control character maps letters to terminal bytes`() {
        assertEquals("\u0001", terminalControlCharacter('a'))
        assertEquals("\u0003", terminalControlCharacter('C'))
        assertNull(terminalControlCharacter('1'))
    }

    @Test
    fun `control input maps ctrl+c and other ctrl letters from key codes`() {
        assertEquals("\u0003", terminalControlInput(KeyEvent.KEYCODE_C, ctrlPressed = true))
        assertEquals("\u000C", terminalControlInput(KeyEvent.KEYCODE_L, ctrlPressed = true))
        assertEquals("\u0004", terminalControlInput(KeyEvent.KEYCODE_D, ctrlPressed = true))
        assertNull(terminalControlInput(KeyEvent.KEYCODE_C, ctrlPressed = false))
        assertNull(terminalControlInput(KeyEvent.KEYCODE_ENTER, ctrlPressed = true))
    }

    @Test
    fun `termux extra keys keep the requested two row layout`() {
        assertEquals(
            listOf("ESC", "/", "-", "HOME", "↑", "END", "PGUP"),
            TerminalTermuxExtraKeyRows[0].map {
                terminalExtraKeyLabel(it, ctrlModifierActive = false, altModifierActive = false)
            },
        )
        assertEquals(
            listOf("TAB", "CTRL", "ALT", "←", "↓", "→", "PGDN"),
            TerminalTermuxExtraKeyRows[1].map {
                terminalExtraKeyLabel(it, ctrlModifierActive = false, altModifierActive = false)
            },
        )
    }

    @Test
    fun `termux modifier labels expose one shot state`() {
        assertEquals(
            "CTRL on",
            terminalExtraKeyLabel(
                TerminalExtraKey.Control,
                ctrlModifierActive = true,
                altModifierActive = false,
            ),
        )
        assertEquals(
            "ALT on",
            terminalExtraKeyLabel(
                TerminalExtraKey.Alt,
                ctrlModifierActive = false,
                altModifierActive = true,
            ),
        )
    }

    @Test
    fun `hobgoblin action row prioritizes reconnect and retains input shortcuts`() {
        assertEquals(
            listOf(
                LocalizedText(R.string.terminal_action_reconnect),
                LocalizedText(R.string.common_value, listOf("ENTER")),
                LocalizedText(R.string.common_value, listOf("⌫")),
                LocalizedText(R.string.common_value, listOf("CTRL+C")),
                LocalizedText(R.string.common_value, listOf("CTRL+L")),
                LocalizedText(R.string.terminal_action_paste),
            ),
            TerminalHobgoblinPrimaryActions.map(::terminalHobgoblinActionText),
        )
    }

    @Test
    fun `selected text browser action opens http and https urls directly`() {
        assertEquals(
            TerminalSelectedTextBrowserAction.OpenUrl("https://example.test/repo"),
            terminalSelectedTextBrowserAction(" https://example.test/repo "),
        )
        assertEquals(
            TerminalSelectedTextBrowserAction.OpenUrl("http://example.test"),
            terminalSelectedTextBrowserAction("http://example.test"),
        )
    }

    @Test
    fun `selected text browser action searches non http text`() {
        assertEquals(
            TerminalSelectedTextBrowserAction.Search("git status modified file"),
            terminalSelectedTextBrowserAction(" git status\nmodified file "),
        )
        assertEquals(
            TerminalSelectedTextBrowserAction.Search("ssh://example.test/repo"),
            terminalSelectedTextBrowserAction("ssh://example.test/repo"),
        )
    }

    @Test
    fun `selected text browser action rejects blank selected text`() {
        assertNull(terminalSelectedTextBrowserAction(""))
        assertNull(terminalSelectedTextBrowserAction(" \n\t "))
    }

    @Test
    fun `selected text browser action caps search text length`() {
        val longText = "x".repeat(TerminalSelectedTextMaxLength + 8)

        assertEquals(
            TerminalSelectedTextBrowserAction.Search("x".repeat(TerminalSelectedTextMaxLength)),
            terminalSelectedTextBrowserAction(longText),
        )
    }

    @Test
    fun `focus mode is explicit temporary presentation state`() {
        assertFalse(TerminalDefaultFocusMode)
        assertTrue(terminalChromeVisible(focusMode = false))
        assertFalse(terminalChromeVisible(focusMode = true))
        assertEquals(LocalizedText(R.string.terminal_focus), terminalFocusActionText(focusMode = false))
        assertEquals(LocalizedText(R.string.terminal_exit_focus), terminalFocusActionText(focusMode = true))
        assertFalse(terminalFocusExitHandleVisible(focusMode = false))
        assertTrue(terminalFocusExitHandleVisible(focusMode = true))
        assertFalse(terminalBackExitsFocus(focusMode = false))
        assertTrue(terminalBackExitsFocus(focusMode = true))
    }

    @Test
    fun `background swipe requires a sufficiently long rightward drag`() {
        assertTrue(terminalBackgroundSwipeTriggered(horizontalDistancePx = 72f, thresholdPx = 72f))
        assertFalse(terminalBackgroundSwipeTriggered(horizontalDistancePx = 71f, thresholdPx = 72f))
        assertFalse(terminalBackgroundSwipeTriggered(horizontalDistancePx = -96f, thresholdPx = 72f))
        assertFalse(terminalBackgroundSwipeTriggered(horizontalDistancePx = 96f, thresholdPx = 0f))
    }

    @Test
    fun `terminal screen groups ordinary controls into a command deck`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("TerminalScreen.kt not found")

        assertTrue(source.contains("private fun TerminalCommandDeck("))
        assertTrue(source.contains("terminalChromeVisible(focusMode)"))
        assertTrue(source.contains("terminalFocusExitHandleVisible(focusMode)"))
        assertTrue(source.contains("text = stringResource(R.string.terminal_exit_focus)"))
    }

    @Test
    fun `terminal screen renders termux rows before a stable hobgoblin action row`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("TerminalScreen.kt not found")

        assertTrue(source.contains("TerminalTermuxExtraKeyRows.forEach"))
        assertTrue(source.contains("TerminalHobgoblinPrimaryActions.forEach"))
        assertFalse(source.contains("if (reconnectEnabled)"))
    }

    @Test
    fun `terminal screen switches the connection action between reconnect and close`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("TerminalScreen.kt not found")

        assertTrue(source.contains("closeEnabled = inlineActions.closeEnabled"))
        assertTrue(source.contains("onClose = ::requestCloseTerminal"))
        assertTrue(source.contains("TerminalHobgoblinAction.Close -> closeEnabled"))
        assertTrue(source.contains("TerminalHobgoblinAction.Close -> onClose()"))
    }

    @Test
    fun `terminal screen keeps background swipe separate from back navigation`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalScreen.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("TerminalScreen.kt not found")

        assertTrue(source.contains("TerminalBackgroundSwipeEdge(onBackground)"))
        assertTrue(source.contains("BackHandler {\n        navigateBack()"))
    }

    @Test
    fun `global project sessions exclude temporary terminals and sort by creation`() {
        val sessions = listOf(
            terminalRecord(id = "session-b", repositoryId = "repo-b", remotePath = "/srv/b", openedAt = 200L),
            terminalRecord(id = "temporary", repositoryId = null, remotePath = "/", openedAt = 50L),
            terminalRecord(id = "session-c", repositoryId = "repo-c", remotePath = "/srv/c", openedAt = 100L),
            terminalRecord(id = "session-a", repositoryId = "repo-a", remotePath = "/srv/a", openedAt = 100L),
        )

        assertEquals(
            listOf("session-a", "session-c", "session-b"),
            terminalGlobalProjectCreatedSessions(sessions).map { it.id },
        )
    }

    @Test
    fun `terminal overview puts newest host and project sessions first`() {
        val sessions = listOf(
            terminalRecord(
                id = "exited",
                repositoryId = "repo-1",
                remotePath = "/srv/app",
                openedAt = 100L,
                status = TerminalSessionStatus.Exited,
                lastActivityAt = 700L,
            ),
            terminalRecord(
                id = "temporary-running",
                repositoryId = null,
                remotePath = "/",
                openedAt = 200L,
                status = TerminalSessionStatus.Running,
                lastActivityAt = 500L,
            ),
            terminalRecord(
                id = "failed",
                repositoryId = "repo-1",
                remotePath = "/srv/app",
                openedAt = 300L,
                status = TerminalSessionStatus.Failed,
                lastActivityAt = 800L,
            ),
            terminalRecord(
                id = "starting",
                repositoryId = "repo-2",
                remotePath = "/srv/other",
                openedAt = 400L,
                status = TerminalSessionStatus.Starting,
                lastActivityAt = 400L,
            ),
            terminalRecord(
                id = "disconnected",
                repositoryId = "repo-2",
                remotePath = "/srv/other",
                openedAt = 500L,
                status = TerminalSessionStatus.Disconnected,
                lastActivityAt = 900L,
            ),
        )

        assertEquals(
            listOf("disconnected", "starting", "failed", "temporary-running", "exited"),
            terminalOverviewOrderedSessions(sessions).map { it.id },
        )
    }

    @Test
    fun `terminal overview order does not change when statuses change`() {
        val sessions = listOf(
            terminalRecord(
                id = "session-b",
                repositoryId = "repo-1",
                remotePath = "/srv/app",
                openedAt = 200L,
                status = TerminalSessionStatus.Running,
            ),
            terminalRecord(
                id = "session-a",
                repositoryId = "repo-1",
                remotePath = "/srv/app",
                openedAt = 100L,
                status = TerminalSessionStatus.Disconnected,
            ),
        )

        val initialOrder = terminalOverviewOrderedSessions(sessions).map { it.id }
        val changedOrder = terminalOverviewOrderedSessions(
            sessions.map { session ->
                session.copy(
                    status = if (session.status == TerminalSessionStatus.Running) {
                        TerminalSessionStatus.Exited
                    } else {
                        TerminalSessionStatus.Running
                    },
                )
            },
        ).map { it.id }

        assertEquals(listOf("session-b", "session-a"), initialOrder)
        assertEquals(initialOrder, changedOrder)
    }

    @Test
    fun `terminal overview ordering uses id as the final deterministic tie breaker`() {
        val sessions = listOf(
            terminalRecord(
                id = "session-b",
                repositoryId = "repo-1",
                remotePath = "/srv/app",
                openedAt = 100L,
                status = TerminalSessionStatus.Disconnected,
                lastActivityAt = 200L,
            ),
            terminalRecord(
                id = "session-a",
                repositoryId = null,
                remotePath = "/",
                openedAt = 100L,
                status = TerminalSessionStatus.Exited,
                lastActivityAt = 200L,
            ),
        )

        assertEquals(
            listOf("session-a", "session-b"),
            terminalOverviewOrderedSessions(sessions).map { it.id },
        )
    }

    @Test
    fun `terminal cycle session id wraps forward and backward`() {
        val sessions = listOf(
            terminalRecord(id = "session-a", repositoryId = "repo-a", remotePath = "/srv/a", openedAt = 100L),
            terminalRecord(id = "session-b", repositoryId = "repo-b", remotePath = "/srv/b", openedAt = 200L),
            terminalRecord(id = "session-c", repositoryId = "repo-c", remotePath = "/srv/c", openedAt = 300L),
        )

        assertEquals("session-b", terminalCycleSessionId(sessions, activeSessionId = "session-a", direction = 1))
        assertEquals("session-a", terminalCycleSessionId(sessions, activeSessionId = "session-c", direction = 1))
        assertEquals("session-c", terminalCycleSessionId(sessions, activeSessionId = "session-a", direction = -1))
    }

    @Test
    fun `terminal cycle session id returns null without switch targets`() {
        val session = terminalRecord(id = "session-a", repositoryId = "repo-a", remotePath = "/srv/a", openedAt = 100L)

        assertNull(terminalCycleSessionId(emptyList(), activeSessionId = null, direction = 1))
        assertNull(terminalCycleSessionId(listOf(session), activeSessionId = "session-a", direction = 1))
    }

    @Test
    fun `terminal cycle session id uses first item when active session is missing`() {
        val sessions = listOf(
            terminalRecord(id = "session-a", repositoryId = "repo-a", remotePath = "/srv/a", openedAt = 100L),
            terminalRecord(id = "session-b", repositoryId = "repo-b", remotePath = "/srv/b", openedAt = 200L),
            terminalRecord(id = "session-c", repositoryId = "repo-c", remotePath = "/srv/c", openedAt = 300L),
        )

        assertEquals("session-b", terminalCycleSessionId(sessions, activeSessionId = "temporary", direction = 1))
        assertEquals("session-c", terminalCycleSessionId(sessions, activeSessionId = "temporary", direction = -1))
    }

    @Test
    fun `workspace created sessions include only same workspace and same normalized path`() {
        val sessions = listOf(
            terminalRecord(id = "same-a", hostId = "host-1", repositoryId = "repo-1", remotePath = "/srv/app", openedAt = 100L),
            terminalRecord(id = "same-b", hostId = "host-1-alias", repositoryId = "repo-1", remotePath = "/srv/app/", openedAt = 200L),
            terminalRecord(id = "other-path", hostId = "host-1", repositoryId = "repo-1", remotePath = "/srv/other", openedAt = 300L),
            terminalRecord(id = "other-host", hostId = "host-2", repositoryId = "repo-1", remotePath = "/srv/app", openedAt = 400L),
        )

        assertEquals(
            listOf("same-a", "same-b"),
            terminalWorkspaceCreatedSessions(
                sessions = sessions,
                hostIds = setOf("host-1", "host-1-alias"),
                remotePath = "/srv/app",
            ).map { it.id },
        )
    }

    @Test
    fun `terminal target label includes repository and worktree path`() {
        assertEquals(
            "App - /srv/app-feature",
            terminalTargetLabel(repositoryTitle = "App", remotePath = "/srv/app-feature"),
        )
    }

    @Test
    fun `terminal title uses workspace session number and directory`() {
        val sessions = listOf(
            terminalRecord(id = "session-a", repositoryId = "repo-1", remotePath = "/srv/app", openedAt = 100L),
            terminalRecord(id = "session-b", repositoryId = "repo-1", remotePath = "/srv/app", openedAt = 200L),
            terminalRecord(id = "session-c", repositoryId = "repo-1", remotePath = "/srv/other", openedAt = 50L),
        )

        assertEquals(
            "terminal-2 /srv/app",
            terminalScreenTitle(
                sessionId = "session-b",
                sessions = sessions,
                hostId = "host-1",
                remotePath = "/srv/app",
            ),
        )
    }

    @Test
    fun `terminal title excludes sessions from other hosts`() {
        val sessions = listOf(
            terminalRecord(id = "session-a", hostId = "host-2", repositoryId = null, remotePath = "/", openedAt = 100L),
            terminalRecord(id = "session-b", hostId = "host-1", repositoryId = null, remotePath = "/", openedAt = 200L),
        )

        assertEquals(
            "terminal-1 /",
            terminalScreenTitle(
                sessionId = "session-b",
                sessions = sessions,
                hostId = "host-1",
                remotePath = "/",
            ),
        )
    }

    private fun terminalRecord(
        id: String,
        hostId: String = "host-1",
        repositoryId: String?,
        remotePath: String,
        openedAt: Long,
        status: TerminalSessionStatus = TerminalSessionStatus.Running,
        lastActivityAt: Long? = null,
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = id,
        hostId = hostId,
        repositoryId = repositoryId,
        remotePath = remotePath,
        targetLabel = "App - $remotePath",
        status = status,
        lastActivityAt = lastActivityAt,
        openedAt = openedAt,
    )
}
