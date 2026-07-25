package dev.hobgoblin.android.navigation

import dev.hobgoblin.android.terminals.TerminalSessionRecord

sealed interface AppRoute {
    data object Hosts : AppRoute
    data object Projects : AppRoute
    data object Terminals : AppRoute
    data object AddHost : AppRoute
    data object AddRepository : AppRoute
    data object Settings : AppRoute
    data class EditHost(val hostId: String) : AppRoute
    data class HostPorts(val hostId: String) : AppRoute
    data class Repository(
        val repositoryId: String,
        val terminalWorkspacePath: String? = null,
    ) : AppRoute
    data class Terminal(
        val hostId: String,
        val remotePath: String = "/",
        val repositoryId: String? = null,
        val terminalSessionId: String? = null,
        val returnToTerminals: Boolean = false,
    ) : AppRoute

    companion object {
        fun terminal(
            session: TerminalSessionRecord,
            returnToTerminals: Boolean = false,
        ): Terminal =
            Terminal(
                hostId = session.hostId,
                remotePath = session.remotePath,
                repositoryId = session.repositoryId,
                terminalSessionId = session.id,
                returnToTerminals = returnToTerminals,
            )
    }
}

internal fun initialMainRoute(): AppRoute = AppRoute.Hosts

internal fun terminalBackgroundRoute(): AppRoute = AppRoute.Terminals

internal fun terminalReturnRoute(
    route: AppRoute.Terminal,
    resolvedHostId: String,
    temporary: Boolean,
): AppRoute = when {
    route.returnToTerminals -> AppRoute.Terminals
    temporary -> AppRoute.Hosts
    route.repositoryId != null -> AppRoute.Repository(
        repositoryId = route.repositoryId,
        terminalWorkspacePath = route.remotePath,
    )
    else -> AppRoute.EditHost(resolvedHostId)
}
