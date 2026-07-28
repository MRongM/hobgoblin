package com.mrongm.hobgoblin.navigation

import com.mrongm.hobgoblin.terminals.TerminalSessionRecord

enum class HostDetailTab {
    Projects,
    Tmux,
}

data class HostDetailReturn(
    val hostId: String,
    val selectedTab: HostDetailTab,
)

sealed interface AppRoute {
    data object Hosts : AppRoute
    data object Projects : AppRoute
    data object Terminals : AppRoute
    data object AddHost : AppRoute
    data object AddRepository : AppRoute
    data object Settings : AppRoute
    data class EditHost(val hostId: String) : AppRoute
    data class HostPorts(val hostId: String) : AppRoute
    data class HostDetail(
        val hostId: String,
        val selectedTab: HostDetailTab = HostDetailTab.Projects,
    ) : AppRoute
    data class Repository(
        val repositoryId: String,
        val terminalWorkspacePath: String? = null,
        val hostDetailReturn: HostDetailReturn? = null,
    ) : AppRoute
    data class Terminal(
        val hostId: String,
        val remotePath: String = "/",
        val repositoryId: String? = null,
        val terminalSessionId: String? = null,
        val returnToTerminals: Boolean = false,
        val hostDetailReturn: HostDetailReturn? = null,
    ) : AppRoute

    companion object {
        fun terminal(
            session: TerminalSessionRecord,
            returnToTerminals: Boolean = false,
            hostDetailReturn: HostDetailReturn? = null,
        ): Terminal =
            Terminal(
                hostId = session.hostId,
                remotePath = session.remotePath,
                repositoryId = session.repositoryId,
                terminalSessionId = session.id,
                returnToTerminals = returnToTerminals,
                hostDetailReturn = hostDetailReturn,
            )
    }
}

internal fun initialMainRoute(): AppRoute = AppRoute.Hosts

internal fun terminalBackgroundRoute(): AppRoute = AppRoute.Terminals

internal fun terminalNotificationRoute(session: TerminalSessionRecord): AppRoute.Terminal =
    AppRoute.terminal(session, returnToTerminals = true)

internal fun terminalReturnRoute(
    route: AppRoute.Terminal,
    resolvedHostId: String,
    temporary: Boolean,
): AppRoute = when {
    route.returnToTerminals -> AppRoute.Terminals
    route.repositoryId != null -> AppRoute.Repository(
        repositoryId = route.repositoryId,
        terminalWorkspacePath = route.remotePath,
        hostDetailReturn = route.hostDetailReturn,
    )
    route.hostDetailReturn != null -> AppRoute.HostDetail(
        hostId = route.hostDetailReturn.hostId,
        selectedTab = route.hostDetailReturn.selectedTab,
    )
    temporary -> AppRoute.Hosts
    else -> AppRoute.EditHost(resolvedHostId)
}
