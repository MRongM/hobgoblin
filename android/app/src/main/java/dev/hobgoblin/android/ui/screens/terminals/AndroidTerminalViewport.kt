package dev.hobgoblin.android.ui.screens.terminals

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import dev.hobgoblin.android.data.TerminalAppearance
import dev.hobgoblin.android.terminals.TerminalSessionState
import dev.hobgoblin.android.terminals.emulator.RemoteTerminalEmulatorController
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

internal val TerminalOriginalViewportWidth = 720.dp

internal fun terminalViewportWidth(availableWidth: Dp, fitToScreen: Boolean): Dp =
    if (fitToScreen) availableWidth else maxOf(availableWidth, TerminalOriginalViewportWidth)

@Composable
internal fun AndroidTerminalViewport(
    modifier: Modifier = Modifier,
    state: TerminalSessionState,
    emulatorController: RemoteTerminalEmulatorController?,
    fitToScreen: Boolean,
    fontSizeSp: Int,
    appearance: TerminalAppearance,
    notice: String? = null,
    onOpenUrl: (String) -> Unit,
    onCopyText: (String) -> Boolean,
    onOpenSelectedText: (String) -> Boolean,
) {
    val banner = terminalViewportBannerMessage(state, notice)
    val palette = terminalPalette(appearance)
    val background = Color(palette.backgroundArgb)
    val foreground = Color(palette.foregroundArgb)
    val surface = Color(palette.surfaceArgb)
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(background),
    ) {
        val horizontalViewportWidthPx = with(LocalDensity.current) { maxWidth.roundToPx() }
        val viewportWidth = terminalViewportWidth(maxWidth, fitToScreen)
        val horizontalScrollState = rememberScrollState()
        val viewportContainerModifier = if (fitToScreen) {
            Modifier.fillMaxSize()
        } else {
            Modifier
                .fillMaxSize()
                .horizontalScroll(horizontalScrollState)
        }
        val viewportContentModifier = if (fitToScreen) {
            Modifier.fillMaxSize()
        } else {
            Modifier
                .width(viewportWidth)
                .fillMaxHeight()
        }
        if (terminalFallbackVisible(emulatorController != null)) {
            Box(modifier = viewportContainerModifier) {
                Text(
                    modifier = viewportContentModifier
                        .padding(HobgoblinSpacing.Sm),
                    text = terminalDisplayText(state),
                    color = foreground,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = fontSizeSp.sp),
                )
            }
        } else {
            val currentController = requireNotNull(emulatorController)
            Box(modifier = viewportContainerModifier) {
                AndroidView(
                    modifier = viewportContentModifier,
                    factory = { context ->
                        HobgoblinTerminalView(context).apply {
                            setHorizontalViewportWidthPx(horizontalViewportWidthPx)
                            setFitToScreen(fitToScreen)
                            setFontSizeSp(fontSizeSp)
                            setTerminalAppearance(appearance)
                            setExternalInteractions(
                                onOpenUrl = onOpenUrl,
                                onCopyText = onCopyText,
                                onOpenSelectedText = onOpenSelectedText,
                            )
                            bind(currentController)
                            requestFocus()
                        }
                    },
                    update = { view ->
                        view.setHorizontalViewportWidthPx(horizontalViewportWidthPx)
                        view.setFitToScreen(fitToScreen)
                        view.setFontSizeSp(fontSizeSp)
                        view.setTerminalAppearance(appearance)
                        view.setExternalInteractions(
                            onOpenUrl = onOpenUrl,
                            onCopyText = onCopyText,
                            onOpenSelectedText = onOpenSelectedText,
                        )
                        view.bind(currentController)
                        view.requestFocus()
                    },
                )
            }
        }
        banner?.let { message ->
            Text(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .background(surface)
                    .padding(HobgoblinSpacing.Sm),
                text = message,
                color = foreground,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}
