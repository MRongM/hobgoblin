package dev.hobgoblin.android.ui.navigation

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

enum class MainTab {
    Hosts,
    Projects,
    Terminals,
}

internal enum class MainTabIconKind {
    Host,
    Folder,
    Terminal,
}

internal enum class MainTabSwipeDirection {
    Previous,
    Next,
}

internal fun shouldSwitchMainTab(current: MainTab, target: MainTab): Boolean = current != target

internal fun mainTabIconKind(tab: MainTab): MainTabIconKind = when (tab) {
    MainTab.Hosts -> MainTabIconKind.Host
    MainTab.Projects -> MainTabIconKind.Folder
    MainTab.Terminals -> MainTabIconKind.Terminal
}

internal fun mainTabAfterSwipe(tab: MainTab, direction: MainTabSwipeDirection): MainTab? {
    val offset = if (direction == MainTabSwipeDirection.Next) 1 else -1
    return MainTab.entries.getOrNull(tab.ordinal + offset)
}

@Composable
fun MainTabBar(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    NavigationBar(modifier = modifier) {
        MainTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = selected == tab,
                onClick = {
                    if (shouldSwitchMainTab(selected, tab)) {
                        onSelect(tab)
                    }
                },
                icon = {
                    Icon(
                        imageVector = mainTabIcon(tab),
                        contentDescription = tab.label,
                        modifier = Modifier.size(24.dp),
                    )
                },
                label = { Text(tab.label) },
                alwaysShowLabel = true,
            )
        }
    }
}

private val MainTab.label: String
    get() = when (this) {
        MainTab.Hosts -> "Hosts"
        MainTab.Projects -> "Projects"
        MainTab.Terminals -> "Terminals"
    }

private fun mainTabIcon(tab: MainTab): ImageVector = when (mainTabIconKind(tab)) {
    MainTabIconKind.Host -> HostTabIcon
    MainTabIconKind.Folder -> FolderTabIcon
    MainTabIconKind.Terminal -> TerminalTabIcon
}

private val HostTabIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "HostTab",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(4f, 4f)
            horizontalLineTo(20f)
            verticalLineTo(10f)
            horizontalLineTo(4f)
            close()
            moveTo(4f, 14f)
            horizontalLineTo(20f)
            verticalLineTo(20f)
            horizontalLineTo(4f)
            close()
            moveTo(7f, 7f)
            arcToRelative(1f, 1f, 0f, true, true, 2f, 0f)
            arcToRelative(1f, 1f, 0f, true, true, -2f, 0f)
            moveTo(7f, 17f)
            arcToRelative(1f, 1f, 0f, true, true, 2f, 0f)
            arcToRelative(1f, 1f, 0f, true, true, -2f, 0f)
            moveTo(12f, 6.5f)
            horizontalLineTo(17f)
            verticalLineTo(7.5f)
            horizontalLineTo(12f)
            close()
            moveTo(12f, 16.5f)
            horizontalLineTo(17f)
            verticalLineTo(17.5f)
            horizontalLineTo(12f)
            close()
        }
    }.build()
}

private val FolderTabIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "FolderTab",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(3f, 6f)
            horizontalLineTo(9f)
            lineTo(11f, 8f)
            horizontalLineTo(21f)
            verticalLineTo(19f)
            horizontalLineTo(3f)
            close()
            moveTo(3f, 5f)
            verticalLineTo(4f)
            horizontalLineTo(10f)
            lineTo(12f, 6f)
            horizontalLineTo(21f)
            verticalLineTo(7f)
            horizontalLineTo(11.2f)
            lineTo(9.2f, 5f)
            close()
        }
    }.build()
}

private val TerminalTabIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "TerminalTab",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(3f, 4f)
            horizontalLineTo(21f)
            verticalLineTo(6f)
            horizontalLineTo(3f)
            close()
            moveTo(3f, 18f)
            horizontalLineTo(21f)
            verticalLineTo(20f)
            horizontalLineTo(3f)
            close()
            moveTo(3f, 6f)
            horizontalLineTo(5f)
            verticalLineTo(18f)
            horizontalLineTo(3f)
            close()
            moveTo(19f, 6f)
            horizontalLineTo(21f)
            verticalLineTo(18f)
            horizontalLineTo(19f)
            close()
            moveTo(6f, 8f)
            lineTo(10f, 12f)
            lineTo(6f, 16f)
            lineTo(7.4f, 17.4f)
            lineTo(12.8f, 12f)
            lineTo(7.4f, 6.6f)
            close()
            moveTo(13f, 16f)
            horizontalLineTo(18f)
            verticalLineTo(18f)
            horizontalLineTo(13f)
            close()
        }
    }.build()
}
