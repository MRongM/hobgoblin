package dev.hobgoblin.android.ui.screens.terminals

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import dev.hobgoblin.android.terminals.TerminalSessionRecord

internal fun terminalSessionIdentitySummary(session: TerminalSessionRecord): String {
    val kind = if (session.tmuxIdentity == null) "native" else "tmux"
    return "$kind · session ${session.id.take(8)}"
}

internal fun terminalSessionTmuxSessionName(session: TerminalSessionRecord): String? =
    session.tmuxIdentity?.sessionName

@Composable
internal fun TerminalSessionIdentityDetails(session: TerminalSessionRecord) {
    Text(
        terminalSessionIdentitySummary(session),
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = FontFamily.Monospace,
    )
    terminalSessionTmuxSessionName(session)?.let { sessionName ->
        Text(
            "tmux session: $sessionName",
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
        )
    }
}
