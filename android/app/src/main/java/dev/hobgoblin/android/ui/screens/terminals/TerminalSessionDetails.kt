package dev.hobgoblin.android.ui.screens.terminals

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import dev.hobgoblin.android.R
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.ui.text.LocalizedText
import dev.hobgoblin.android.ui.text.resolve

internal fun terminalSessionIdentityText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    R.string.terminal_session_identity,
    listOf(
        LocalizedText(
            if (session.tmuxIdentity == null) R.string.terminal_kind_native else R.string.terminal_kind_tmux,
        ),
        session.id.take(8),
    ),
)

internal fun terminalSessionTmuxSessionName(session: TerminalSessionRecord): String? =
    session.tmuxIdentity?.sessionName

@Composable
internal fun TerminalSessionIdentityDetails(session: TerminalSessionRecord) {
    Text(
        terminalSessionIdentityText(session).resolve(),
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = FontFamily.Monospace,
    )
    terminalSessionTmuxSessionName(session)?.let { sessionName ->
        Text(
            LocalizedText(R.string.terminal_tmux_session_name, listOf(sessionName)).resolve(),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
        )
    }
}
