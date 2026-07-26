package dev.hobgoblin.android.ui.screens.terminals

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.data.TerminalAppearance
import dev.hobgoblin.android.notifications.NotificationPermissionPolicy
import dev.hobgoblin.android.terminals.TerminalForegroundBridge
import dev.hobgoblin.android.terminals.TerminalSessionManager
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TerminalSessionState
import dev.hobgoblin.android.terminals.TerminalSessionStatus
import dev.hobgoblin.android.ui.screens.terminals.terminalWorkspaceCreatedSessions
import dev.hobgoblin.android.terminals.toTerminalSessionState
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal val TerminalCommandInputHeight = 40.dp
internal val TerminalActionButtonHeight = 36.dp
private val TerminalSwitchArrowButtonMinWidth = 38.dp
private val TerminalSwitchArrowFontSize = 18.sp
private val TerminalCommandInputShape = RoundedCornerShape(6.dp)
private val TerminalBackgroundSwipeEdgeWidth = 48.dp
private val TerminalBackgroundSwipeThreshold = 72.dp
private val LocalTerminalPalette = staticCompositionLocalOf { terminalPalette(TerminalAppearance.Dark) }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalScreen(
    host: SshHostProfile,
    remotePath: String = "/",
    repositoryId: String? = null,
    repositoryRemotePath: String? = null,
    targetLabel: String = terminalTargetLabel(host.title, remotePath),
    backHint: String = TerminalBackKeepsSessionHint,
    terminalSessionId: String? = null,
    terminalSessionManager: TerminalSessionManager,
    terminalForegroundBridge: TerminalForegroundBridge,
    fitToScreen: Boolean,
    onFitToScreenChange: (Boolean) -> Unit,
    appearance: TerminalAppearance,
    onAppearanceChange: (TerminalAppearance) -> Unit,
    onSwitchGlobalTerminal: (TerminalSessionRecord) -> Unit,
    onBackground: () -> Unit,
    onBack: (String?) -> Unit,
) {
    var terminalState: TerminalSessionState by remember { mutableStateOf(TerminalSessionState.Idle) }
    var activeSessionId by remember(host, remotePath, repositoryId, terminalSessionId) {
        mutableStateOf(terminalSessionId)
    }
    var terminalSessions by remember { mutableStateOf(terminalSessionManager.sessions()) }
    var ctrlModifierActive by remember { mutableStateOf(false) }
    var altModifierActive by remember { mutableStateOf(false) }
    var focusMode by remember(host.id, remotePath, repositoryId, terminalSessionId) {
        mutableStateOf(TerminalDefaultFocusMode)
    }
    var terminalFontSizeSp by remember { mutableStateOf(TerminalDefaultFontSizeSp) }
    var commandInputVisible by remember { mutableStateOf(TerminalCommandInputDefaultVisible) }
    var isSendingCommandInput by remember { mutableStateOf(false) }
    var commandInput by remember(activeSessionId) { mutableStateOf("") }
    var terminalActionMenuExpanded by remember { mutableStateOf(false) }
    var closeConfirmationVisible by remember { mutableStateOf(false) }
    val clipboard = LocalClipboard.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val target = remember(host, remotePath) { RemoteTarget.fromHostProfile(host, remotePath) }
    val workspaceHostId = target.id
    val workspaceHostIds = remember(host.id, workspaceHostId) { setOf(host.id, workspaceHostId) }
    var inputNotice by remember { mutableStateOf<String?>(null) }
    var notificationPermissionRequested by remember { mutableStateOf(false) }
    val inputAvailable = terminalInputAvailable(terminalState)
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        terminalForegroundBridge.sync()
    }
    val activeTerminalPath = remotePath.ifBlank { "/" }

    fun openTerminalUrl(url: String): Boolean {
        val safeUrl = terminalSafeExternalUrl(url)
        if (safeUrl == null) {
            inputNotice = "URL is not supported."
            return false
        }
        return try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safeUrl)))
            inputNotice = null
            true
        } catch (_: ActivityNotFoundException) {
            inputNotice = "No browser available."
            false
        } catch (_: Exception) {
            inputNotice = "Could not open browser."
            false
        }
    }

    fun searchTerminalText(query: String): Boolean {
        if (query.isBlank()) {
            inputNotice = "Selection is empty."
            return false
        }
        return try {
            context.startActivity(
                Intent(Intent.ACTION_WEB_SEARCH)
                    .putExtra(SearchManager.QUERY, query),
            )
            inputNotice = null
            true
        } catch (_: ActivityNotFoundException) {
            inputNotice = "No browser available."
            false
        } catch (_: Exception) {
            inputNotice = "Could not open browser."
            false
        }
    }

    fun openSelectedTerminalText(text: String): Boolean {
        val action = terminalSelectedTextBrowserAction(text)
        if (action == null) {
            inputNotice = "Selection is empty."
            return false
        }
        return when (action) {
            is TerminalSelectedTextBrowserAction.OpenUrl -> openTerminalUrl(action.url)
            is TerminalSelectedTextBrowserAction.Search -> searchTerminalText(action.query)
        }
    }

    fun copyTerminalSelection(text: String): Boolean {
        if (text.isBlank()) {
            inputNotice = "Selection is empty."
            return false
        }
        return try {
            val manager = ContextCompat.getSystemService(context, ClipboardManager::class.java)
            if (manager == null) {
                inputNotice = "Copy failed."
                false
            } else {
                manager.setPrimaryClip(ClipData.newPlainText("Hobgoblin terminal selection", text))
                inputNotice = "Copied."
                true
            }
        } catch (_: Exception) {
            inputNotice = "Copy failed."
            false
        }
    }

    fun syncTerminalForeground() {
        val permissionGranted = ContextCompat.checkSelfPermission(
            context,
            NotificationPermissionPolicy.Permission,
        ) == PackageManager.PERMISSION_GRANTED
        val hasRunningTerminal = terminalSessionManager.sessions().any { it.status == TerminalSessionStatus.Running }
        if (
            !notificationPermissionRequested &&
            NotificationPermissionPolicy.shouldRequestNotificationPermission(
                sdkInt = Build.VERSION.SDK_INT,
                permissionGranted = permissionGranted,
                foregroundNotificationNeeded = hasRunningTerminal,
            )
        ) {
            notificationPermissionRequested = true
            notificationPermissionLauncher.launch(NotificationPermissionPolicy.Permission)
        }
        terminalForegroundBridge.sync()
    }

    fun connect() {
        scope.launch {
            val record = withContext(Dispatchers.IO) {
                val sessionId = activeSessionId
                if (sessionId != null && terminalReconnectAvailable(terminalState)) {
                    terminalSessionManager.reconnect(
                        sessionId = sessionId,
                        target = target,
                        repositoryId = repositoryId,
                        repositoryRemotePath = repositoryRemotePath,
                        targetLabel = targetLabel,
                    )
                } else {
                    terminalSessionManager.createOrAttach(
                        target = target,
                        repositoryId = repositoryId,
                        repositoryRemotePath = repositoryRemotePath,
                        targetLabel = targetLabel,
                    )
                }
            }
            if (record != null) {
                activeSessionId = record.id
                terminalState = record.toTerminalSessionState()
            }
            syncTerminalForeground()
        }
    }

    fun sendTerminalInputLocked(
        value: String,
        isSending: Boolean,
        setSending: (Boolean) -> Unit,
        onResult: (Boolean) -> Unit = {},
    ) {
        if (isSending) return
        setSending(true)
        scope.launch {
            val sent = try {
                val sessionId = activeSessionId
                withContext(Dispatchers.IO) {
                    sessionId?.let { terminalSessionManager.sendInput(it, value) } ?: false
                }
            } catch (_: Exception) {
                false
            }
            syncTerminalForeground()
            setSending(false)
            onResult(sent)
        }
    }

    fun sendCommandInput() {
        val value = commandInput
        if (value.isEmpty()) return
        sendTerminalInputLocked(
            value = terminalLineInput(value),
            isSending = isSendingCommandInput,
            setSending = { isSendingCommandInput = it },
        ) { sent ->
            if (sent) {
                commandInput = ""
                inputNotice = null
            } else {
                inputNotice = terminalInputUnavailableMessage(terminalState) ?: "Terminal is not connected."
            }
        }
    }

    fun closeTerminal() {
        scope.launch {
            val sessionId = activeSessionId
            withContext(Dispatchers.IO) {
                if (sessionId != null) terminalSessionManager.close(sessionId)
            }
            syncTerminalForeground()
            onBack(sessionId)
        }
    }

    fun requestCloseTerminal() {
        closeConfirmationVisible = true
    }

    fun sendControlInput(value: String) {
        sendTerminalInputLocked(
            value = value,
            isSending = false,
            setSending = { _ -> },
        ) { sent ->
            inputNotice = if (sent) null else "Terminal is not connected."
        }
        ctrlModifierActive = false
        altModifierActive = false
    }

    fun sendExtraKey(key: TerminalExtraKey) {
        when (key) {
            TerminalExtraKey.Control -> {
                ctrlModifierActive = !ctrlModifierActive
                return
            }
            TerminalExtraKey.Alt -> {
                altModifierActive = !altModifierActive
                return
            }
            else -> Unit
        }

        val activeController = activeSessionId?.let(terminalSessionManager::emulatorController)
        val input = terminalExtraKeyBytes(
            key = key,
            ctrlPressed = ctrlModifierActive,
            altPressed = altModifierActive,
            cursorKeysApplicationMode = activeController?.emulator?.isCursorKeysApplicationMode ?: false,
            keypadApplicationMode = activeController?.emulator?.isKeypadApplicationMode ?: false,
        )?.toString(Charsets.UTF_8) ?: return
        sendTerminalInputLocked(input, false, { _ -> })
        ctrlModifierActive = false
        altModifierActive = false
    }

    fun switchToSession(targetSessionId: String) {
        if (targetSessionId == activeSessionId) return
        val targetSession = terminalSessionManager.session(targetSessionId) ?: return
        activeSessionId = targetSessionId
        terminalState = targetSession.toTerminalSessionState()
    }

    fun cycleWorkspaceTerminal(direction: Int) {
        val availableSessions = terminalWorkspaceCreatedSessions(
            sessions = terminalSessions,
            hostIds = workspaceHostIds,
            remotePath = activeTerminalPath,
        )
        if (availableSessions.size <= 1) return
        val currentIndex = availableSessions.indexOfFirst { it.id == activeSessionId }.takeIf { it >= 0 } ?: 0
        val nextIndex = (currentIndex + direction).mod(availableSessions.size)
        switchToSession(availableSessions[nextIndex].id)
    }

    fun cycleGlobalProjectTerminal(direction: Int) {
        val availableSessions = terminalGlobalProjectCreatedSessions(terminalSessions)
        val targetSessionId = terminalCycleSessionId(
            sessions = availableSessions,
            activeSessionId = activeSessionId,
            direction = direction,
        ) ?: return
        val targetSession = availableSessions.firstOrNull { it.id == targetSessionId } ?: return
        onSwitchGlobalTerminal(targetSession)
    }

    DisposableEffect(activeSessionId) {
        val sessionId = activeSessionId
        if (sessionId == null) {
            onDispose { }
        } else {
            val observer = terminalSessionManager.observe(sessionId) { record ->
                scope.launch {
                    terminalState = record.toTerminalSessionState()
                    syncTerminalForeground()
                }
            }
            onDispose {
                observer.close()
            }
        }
    }

    LaunchedEffect(activeSessionId) {
        ctrlModifierActive = false
        altModifierActive = false
    }

    DisposableEffect(terminalSessionManager) {
        val observer = terminalSessionManager.observeSessions { sessions ->
            scope.launch {
                terminalSessions = sessions
            }
        }
        onDispose { observer.close() }
    }

    LaunchedEffect(target, repositoryId, repositoryRemotePath, targetLabel, terminalSessionId) {
        val record = withContext(Dispatchers.IO) {
            terminalSessionId
                ?.let { terminalSessionManager.session(it) }
                ?: terminalSessionManager.createOrAttach(
                    target = target,
                    repositoryId = repositoryId,
                    repositoryRemotePath = repositoryRemotePath,
                    targetLabel = targetLabel,
                )
        }
        activeSessionId = record.id
        terminalState = record.toTerminalSessionState()
        syncTerminalForeground()
    }

    LaunchedEffect(terminalSessions, activeSessionId, workspaceHostIds, activeTerminalPath) {
        val workspaceSessions = terminalWorkspaceCreatedSessions(
            sessions = terminalSessions,
            hostIds = workspaceHostIds,
            remotePath = activeTerminalPath,
        )
        val workspaceSession = workspaceSessions.maxByOrNull { it.openedAt }
        val fallbackSession = workspaceSession ?: terminalSessions.maxByOrNull { it.openedAt }
        if (activeSessionId == null && fallbackSession != null) {
            switchToSession(fallbackSession.id)
        } else if (activeSessionId != null && terminalSessions.none { it.id == activeSessionId }) {
            if (fallbackSession != null) {
                switchToSession(fallbackSession.id)
            } else {
                activeSessionId = null
                terminalState = TerminalSessionState.Idle
            }
        }
    }

    val screenTitle = terminalScreenTitle(
        sessionId = activeSessionId,
        sessions = terminalSessions,
        hostIds = workspaceHostIds,
        remotePath = remotePath,
    )
    val workspaceSessions = terminalWorkspaceCreatedSessions(
        sessions = terminalSessions,
        hostIds = workspaceHostIds,
        remotePath = activeTerminalPath,
    )
    val hasWorkspaceSwitchTargets = workspaceSessions.size > 1
    val globalProjectSessions = terminalGlobalProjectCreatedSessions(terminalSessions)
    val hasGlobalSwitchTargets = globalProjectSessions.size > 1
    val inlineActions = terminalDetailInlineActions(terminalState)
    val topBarInfo = terminalStatusLine(host = host, remotePath = remotePath, state = terminalState)
    val emulatorController = activeSessionId?.let { terminalSessionManager.emulatorController(it) }
    val commandInputEnabled = terminalCommandInputEnabled(terminalState) && !isSendingCommandInput
    val palette = terminalPalette(appearance)

    val navigateBack = {
        if (terminalBackExitsFocus(focusMode)) {
            focusMode = false
        } else {
            onBack(activeSessionId)
        }
    }

    BackHandler {
        navigateBack()
    }

    Scaffold(
        topBar = {
            if (terminalChromeVisible(focusMode)) TopAppBar(
                modifier = Modifier.height(56.dp),
                title = {
                    Column {
                        Text(
                            text = screenTitle,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Text(
                            text = topBarInfo,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = {
                    TextButton(onClick = { navigateBack() }) {
                        Text("Back")
                    }
                },
                actions = {
                    Box {
                        TextButton(onClick = { terminalActionMenuExpanded = true }) {
                            Text("⋮")
                        }
                        DropdownMenu(
                            expanded = terminalActionMenuExpanded,
                            onDismissRequest = { terminalActionMenuExpanded = false },
                        ) {
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        if (fitToScreen) "Original width" else "Fit to screen width",
                                    )
                                },
                                onClick = {
                                    onFitToScreenChange(!fitToScreen)
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = {
                                    Text("Use ${terminalAppearanceToggleLabel(appearance).lowercase()} appearance")
                                },
                                onClick = {
                                    onAppearanceChange(nextTerminalAppearance(appearance))
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(terminalFocusActionLabel(focusMode)) },
                                onClick = {
                                    focusMode = !focusMode
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(terminalCommandInputVisibilityActionLabel(commandInputVisible)) },
                                onClick = {
                                    commandInputVisible = !commandInputVisible
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Font size: ${terminalFontSizeSp}sp") },
                                enabled = false,
                                onClick = {},
                            )
                            DropdownMenuItem(
                                text = { Text("Font smaller") },
                                enabled = terminalFontSizeSp > TerminalMinFontSizeSp,
                                onClick = {
                                    terminalFontSizeSp = terminalAdjustedFontSize(terminalFontSizeSp, -1)
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Font larger") },
                                enabled = terminalFontSizeSp < TerminalMaxFontSizeSp,
                                onClick = {
                                    terminalFontSizeSp = terminalAdjustedFontSize(terminalFontSizeSp, 1)
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Reset font size") },
                                enabled = terminalFontSizeSp != TerminalDefaultFontSizeSp,
                                onClick = {
                                    terminalFontSizeSp = TerminalDefaultFontSizeSp
                                    terminalActionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Reconnect terminal") },
                                enabled = terminalReconnectAvailable(terminalState),
                                onClick = {
                                    terminalActionMenuExpanded = false
                                    if (terminalReconnectAvailable(terminalState)) {
                                        connect()
                                    }
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Close terminal") },
                                onClick = {
                                    terminalActionMenuExpanded = false
                                    requestCloseTerminal()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Back") },
                                onClick = {
                                    terminalActionMenuExpanded = false
                                    navigateBack()
                                },
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            CompositionLocalProvider(LocalTerminalPalette provides palette) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(palette.backgroundArgb)),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .imePadding()
                            .padding(if (focusMode) 0.dp else HobgoblinSpacing.Sm),
                        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                    ) {
                        AndroidTerminalViewport(
                            modifier = Modifier.weight(1f),
                            state = terminalState,
                            emulatorController = emulatorController,
                            fitToScreen = fitToScreen,
                            fontSizeSp = terminalFontSizeSp,
                            appearance = appearance,
                            ctrlModifierActive = ctrlModifierActive,
                            altModifierActive = altModifierActive,
                            onStickyModifiersConsumed = {
                                ctrlModifierActive = false
                                altModifierActive = false
                            },
                            notice = inputNotice,
                            onOpenUrl = { openTerminalUrl(it) },
                            onCopyText = ::copyTerminalSelection,
                            onOpenSelectedText = ::openSelectedTerminalText,
                        )
                        if (terminalChromeVisible(focusMode)) {
                            TerminalCommandDeck(
                                inputAvailable = inputAvailable,
                                ctrlModifierActive = ctrlModifierActive,
                                altModifierActive = altModifierActive,
                                onExtraKey = ::sendExtraKey,
                                onCtrlC = { sendControlInput("\u0003") },
                                onCtrlL = { sendControlInput(terminalControlCharacter('L') ?: "\u000C") },
                                onEnter = { sendTerminalInputLocked("\r", false, { _ -> }) },
                                onBackspace = { sendTerminalInputLocked("\u007F", false, { _ -> }) },
                                onPaste = {
                                    val unavailable = terminalInputUnavailableMessage(terminalState)
                                    if (unavailable != null) {
                                        inputNotice = unavailable
                                    } else {
                                        scope.launch {
                                            val text = clipboard.getClipEntry()
                                                ?.clipData
                                                ?.getItemAt(0)
                                                ?.coerceToText(context)
                                                ?.toString()
                                                .orEmpty()
                                            val pasted = withContext(Dispatchers.IO) {
                                                activeSessionId?.let { terminalSessionManager.paste(it, text) } ?: false
                                            }
                                            syncTerminalForeground()
                                            inputNotice = if (pasted) null else "Terminal is not connected."
                                        }
                                    }
                                },
                                commandInputVisible = commandInputVisible,
                                commandInput = commandInput,
                                onCommandInputChange = { commandInput = it },
                                commandInputEnabled = commandInputEnabled,
                                commandInputPlaceholder = terminalCommandInputPlaceholder(terminalState),
                                onSendCommand = { sendCommandInput() },
                                fitToScreen = fitToScreen,
                                onFitToScreenChange = onFitToScreenChange,
                                appearance = appearance,
                                onAppearanceChange = onAppearanceChange,
                                hasGlobalSwitchTargets = hasGlobalSwitchTargets,
                                onCycleGlobalTerminal = ::cycleGlobalProjectTerminal,
                                hasWorkspaceSwitchTargets = hasWorkspaceSwitchTargets,
                                onCycleWorkspaceTerminal = ::cycleWorkspaceTerminal,
                                reconnectEnabled = inlineActions.reconnectEnabled,
                                onReconnect = { connect() },
                                onToggleCommandInput = { commandInputVisible = !commandInputVisible },
                                onEnterFocus = { focusMode = true },
                            )
                        }
                    }
                    if (terminalFocusExitHandleVisible(focusMode)) {
                        TerminalTextButton(
                            text = "Exit focus",
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(HobgoblinSpacing.Sm)
                                .background(
                                    Color(palette.surfaceArgb).copy(alpha = 0.92f),
                                    RoundedCornerShape(18.dp),
                                ),
                            onClick = { focusMode = false },
                        )
                    }
                    TerminalBackgroundSwipeEdge(onBackground)
                }
            }
        }
    }

    if (closeConfirmationVisible) {
        AlertDialog(
            onDismissRequest = { closeConfirmationVisible = false },
            title = { Text("Close terminal?") },
            text = { Text(terminalCloseConfirmationText(screenTitle)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        closeConfirmationVisible = false
                        closeTerminal()
                    },
                ) {
                    Text("Stop and close")
                }
            },
            dismissButton = {
                TextButton(onClick = { closeConfirmationVisible = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun BoxScope.TerminalBackgroundSwipeEdge(onBackground: () -> Unit) {
    Box(
        modifier = Modifier
            .align(Alignment.CenterStart)
            .fillMaxHeight()
            .width(TerminalBackgroundSwipeEdgeWidth)
            .pointerInput(onBackground) {
                val thresholdPx = TerminalBackgroundSwipeThreshold.toPx()
                var horizontalDistancePx = 0f
                detectHorizontalDragGestures(
                    onDragStart = { horizontalDistancePx = 0f },
                    onDragCancel = { horizontalDistancePx = 0f },
                    onDragEnd = {
                        val shouldBackground = terminalBackgroundSwipeTriggered(
                            horizontalDistancePx = horizontalDistancePx,
                            thresholdPx = thresholdPx,
                        )
                        horizontalDistancePx = 0f
                        if (shouldBackground) onBackground()
                    },
                    onHorizontalDrag = { change, dragAmount ->
                        horizontalDistancePx += dragAmount
                        change.consume()
                    },
                )
            },
    )
}

private fun terminalStatusLine(
    host: SshHostProfile,
    remotePath: String,
    state: TerminalSessionState,
): String {
    val status = terminalSessionStatusLabel(state)
    return "${host.title} - ${remotePath.ifBlank { "/" }} - $status"
}

@Composable
private fun TerminalCommandDeck(
    inputAvailable: Boolean,
    ctrlModifierActive: Boolean,
    altModifierActive: Boolean,
    onExtraKey: (TerminalExtraKey) -> Unit,
    onCtrlC: () -> Unit,
    onCtrlL: () -> Unit,
    onEnter: () -> Unit,
    onBackspace: () -> Unit,
    onPaste: () -> Unit,
    commandInputVisible: Boolean,
    commandInput: String,
    onCommandInputChange: (String) -> Unit,
    commandInputEnabled: Boolean,
    commandInputPlaceholder: String,
    onSendCommand: () -> Unit,
    fitToScreen: Boolean,
    onFitToScreenChange: (Boolean) -> Unit,
    appearance: TerminalAppearance,
    onAppearanceChange: (TerminalAppearance) -> Unit,
    hasGlobalSwitchTargets: Boolean,
    onCycleGlobalTerminal: (Int) -> Unit,
    hasWorkspaceSwitchTargets: Boolean,
    onCycleWorkspaceTerminal: (Int) -> Unit,
    reconnectEnabled: Boolean,
    onReconnect: () -> Unit,
    onToggleCommandInput: () -> Unit,
    onEnterFocus: () -> Unit,
) {
    val palette = LocalTerminalPalette.current
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(palette.surfaceArgb), shape)
            .border(1.dp, Color(palette.dividerArgb), shape)
            .padding(horizontal = HobgoblinSpacing.Sm, vertical = HobgoblinSpacing.Xs),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
    ) {
        TermuxExtraKeyRows(
            enabled = inputAvailable,
            ctrlModifierActive = ctrlModifierActive,
            altModifierActive = altModifierActive,
            onKey = onExtraKey,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            TerminalHobgoblinPrimaryActions.forEach { action ->
                val actionEnabled = when (action) {
                    TerminalHobgoblinAction.Reconnect -> reconnectEnabled
                    else -> inputAvailable
                }
                TerminalTextButton(
                    text = terminalHobgoblinActionLabel(action),
                    enabled = actionEnabled,
                    onClick = {
                        when (action) {
                            TerminalHobgoblinAction.Reconnect -> onReconnect()
                            TerminalHobgoblinAction.Enter -> onEnter()
                            TerminalHobgoblinAction.Backspace -> onBackspace()
                            TerminalHobgoblinAction.ControlC -> onCtrlC()
                            TerminalHobgoblinAction.ControlL -> onCtrlL()
                            TerminalHobgoblinAction.Paste -> onPaste()
                        }
                    },
                )
            }
            if (hasGlobalSwitchTargets) {
                TerminalSwitchArrowButton(text = "⇈", onClick = { onCycleGlobalTerminal(-1) })
                TerminalSwitchArrowButton(text = "⇊", onClick = { onCycleGlobalTerminal(1) })
            }
            if (hasWorkspaceSwitchTargets) {
                TerminalSwitchArrowButton(text = "↑", onClick = { onCycleWorkspaceTerminal(-1) })
                TerminalSwitchArrowButton(text = "↓", onClick = { onCycleWorkspaceTerminal(1) })
            }
            TerminalTextButton(
                text = if (commandInputVisible) "Hide command" else "Command",
                onClick = onToggleCommandInput,
            )
            TerminalTextButton(
                text = if (fitToScreen) "Original width" else "Fit width",
                onClick = { onFitToScreenChange(!fitToScreen) },
            )
            TerminalTextButton(
                text = terminalAppearanceToggleLabel(appearance),
                onClick = { onAppearanceChange(nextTerminalAppearance(appearance)) },
            )
            TerminalTextButton(text = "Focus", onClick = onEnterFocus)
        }
        if (commandInputVisible) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CompactCommandInput(
                    modifier = Modifier.weight(1f),
                    value = commandInput,
                    onValueChange = onCommandInputChange,
                    enabled = commandInputEnabled,
                    placeholder = commandInputPlaceholder,
                    onSend = onSendCommand,
                )
                TerminalTextButton(
                    text = "Send",
                    enabled = commandInputEnabled && commandInput.isNotEmpty(),
                    onClick = onSendCommand,
                )
            }
        }
    }
}

@Composable
private fun CompactCommandInput(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    placeholder: String,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalTerminalPalette.current
    val textColor = if (enabled) {
        Color(palette.foregroundArgb)
    } else {
        Color(palette.mutedArgb)
    }
    var fieldValue by remember {
        mutableStateOf(TextFieldValue(text = value, selection = TextRange(value.length)))
    }

    LaunchedEffect(value) {
        if (value != fieldValue.text) {
            fieldValue = TextFieldValue(text = value, selection = TextRange(value.length))
        }
    }

    BasicTextField(
        value = fieldValue,
        onValueChange = { next ->
            fieldValue = next
            if (next.text != value) onValueChange(next.text)
        },
        enabled = enabled,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodySmall.copy(color = textColor),
        cursorBrush = SolidColor(Color(palette.actionArgb)),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
        keyboardActions = KeyboardActions(onSend = { onSend() }),
        modifier = modifier
            .height(TerminalCommandInputHeight)
            .background(Color(palette.surfaceArgb), TerminalCommandInputShape)
            .border(1.dp, Color(palette.dividerArgb), TerminalCommandInputShape),
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 10.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (fieldValue.text.isEmpty()) {
                    Text(
                        text = placeholder,
                        color = Color(palette.mutedArgb),
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                innerTextField()
            }
        },
    )
}

@Composable
private fun TerminalTextButton(
    text: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    textStyle: TextStyle = MaterialTheme.typography.labelMedium,
) {
    val palette = LocalTerminalPalette.current
    TextButton(
        modifier = modifier.height(TerminalActionButtonHeight),
        enabled = enabled,
        onClick = onClick,
        colors = ButtonDefaults.textButtonColors(
            contentColor = Color(palette.actionArgb),
            disabledContentColor = Color(palette.mutedArgb),
        ),
    ) {
        Text(
            text = text,
            style = textStyle,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TerminalSwitchArrowButton(
    text: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    TerminalTextButton(
        text = text,
        enabled = enabled,
        onClick = onClick,
        modifier = Modifier.widthIn(min = TerminalSwitchArrowButtonMinWidth),
        textStyle = MaterialTheme.typography.labelLarge.copy(fontSize = TerminalSwitchArrowFontSize),
    )
}

@Composable
private fun TermuxExtraKeyRows(
    enabled: Boolean,
    ctrlModifierActive: Boolean,
    altModifierActive: Boolean,
    onKey: (TerminalExtraKey) -> Unit,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
    ) {
        TerminalTermuxExtraKeyRows.forEach { row ->
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
            ) {
                row.forEach { key ->
                    TerminalTextButton(
                        text = terminalExtraKeyLabel(key, ctrlModifierActive, altModifierActive),
                        enabled = enabled,
                        onClick = { onKey(key) },
                    )
                }
            }
        }
    }
}
