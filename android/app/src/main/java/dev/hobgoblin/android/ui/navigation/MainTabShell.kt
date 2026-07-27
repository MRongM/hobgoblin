package dev.hobgoblin.android.ui.navigation

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.dp
import dev.hobgoblin.android.R
import dev.hobgoblin.android.domain.ResourceState
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainTabShell(
    selectedTab: MainTab,
    onSelectTab: (MainTab) -> Unit,
    onOpenSettings: () -> Unit,
    onAddHost: () -> Unit,
    onAddProject: () -> Unit,
    repositoriesState: ResourceState<List<RemoteRepositoryProfile>>,
    hostsContent: @Composable () -> Unit,
    projectsContent: @Composable () -> Unit,
    terminalsContent: @Composable () -> Unit,
) {
    val topBarTitle = stringResource(
        when (selectedTab) {
            MainTab.Hosts -> R.string.navigation_ssh_hosts
            MainTab.Projects -> repositoriesState.projectScreenTitleResource()
            MainTab.Terminals -> R.string.common_terminals
        },
    )
    val density = LocalDensity.current
    val swipeThresholdPx = with(density) { 72.dp.toPx() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(topBarTitle) },
                actions = {
                    TextButton(onClick = onOpenSettings) {
                        Text(stringResource(R.string.navigation_settings))
                    }
                    when (selectedTab) {
                        MainTab.Hosts -> TextButton(onClick = onAddHost) {
                            Text(stringResource(R.string.navigation_add_host))
                        }
                        MainTab.Projects -> TextButton(onClick = onAddProject) {
                            Text(stringResource(R.string.navigation_add_project))
                        }
                        MainTab.Terminals -> Unit
                    }
                },
            )
        },
        bottomBar = {
            MainTabBar(
                selected = selectedTab,
                onSelect = onSelectTab,
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .pointerInput(selectedTab) {
                    var draggedDistance = 0f
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { _, amount ->
                            draggedDistance += amount
                            val direction = when {
                                draggedDistance <= -swipeThresholdPx -> MainTabSwipeDirection.Next
                                draggedDistance >= swipeThresholdPx -> MainTabSwipeDirection.Previous
                                else -> null
                            }
                            if (direction != null) {
                                mainTabAfterSwipe(selectedTab, direction)?.let(onSelectTab)
                                draggedDistance = 0f
                            }
                        },
                        onDragEnd = {
                            draggedDistance = 0f
                        },
                        onDragCancel = {
                            draggedDistance = 0f
                        },
                    )
                },
        ) {
            MainTabPane(
                visible = selectedTab == MainTab.Hosts,
                content = hostsContent,
            )
            MainTabPane(
                visible = selectedTab == MainTab.Projects,
                content = projectsContent,
            )
            MainTabPane(
                visible = selectedTab == MainTab.Terminals,
                content = terminalsContent,
            )
        }
    }
}

private fun ResourceState<List<RemoteRepositoryProfile>>.projectScreenTitleResource(): Int = when (this) {
    is ResourceState.Loaded -> R.string.navigation_projects
    is ResourceState.Stale -> R.string.navigation_projects
    is ResourceState.Error -> R.string.navigation_projects
    ResourceState.Idle, ResourceState.Loading -> R.string.navigation_projects
}

@Composable
private fun MainTabPane(
    visible: Boolean,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .zIndex(if (visible) 1f else 0f)
            .alpha(if (visible) 1f else 0f)
            .layout { measurable, constraints ->
                val placeable = measurable.measure(constraints)
                if (visible) {
                    layout(placeable.width, placeable.height) {
                        placeable.placeRelative(0, 0)
                    }
                } else {
                    layout(0, 0) {}
                }
            },
    ) {
        content()
    }
}
