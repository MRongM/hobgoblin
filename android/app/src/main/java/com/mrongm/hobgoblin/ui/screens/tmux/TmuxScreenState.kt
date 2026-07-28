package com.mrongm.hobgoblin.ui.screens.tmux

import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.navigation.AppRoute

internal fun tmuxRoute(): AppRoute.Tmux = AppRoute.Tmux()

internal fun selectTmuxHost(hostId: String): AppRoute.Tmux {
    val normalizedHostId = hostId.trim()
    require(normalizedHostId.isNotEmpty()) { "Host id is required" }
    return AppRoute.Tmux(selectedHostId = normalizedHostId)
}

internal fun tmuxNeedsScan(route: AppRoute): Boolean =
    route is AppRoute.Tmux && !route.selectedHostId.isNullOrBlank()

internal fun <T> tmuxStateForHost(
    selectedHostId: String?,
    stateHostId: String?,
    state: ResourceState<T>,
): ResourceState<T> = if (selectedHostId != null && selectedHostId == stateHostId) {
    state
} else {
    ResourceState.Idle
}

internal fun tmuxScanOwnsRefreshIndicator(
    currentRoute: AppRoute,
    scanHostId: String,
): Boolean {
    val currentTmuxRoute = currentRoute as? AppRoute.Tmux ?: return true
    return currentTmuxRoute.selectedHostId == scanHostId
}
