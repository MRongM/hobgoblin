package com.mrongm.hobgoblin.navigation

import com.mrongm.hobgoblin.terminals.TerminalSessionRecord

data class HostDetailReturn(
    val hostId: String,
)

data class TmuxReturn(val hostId: String)

sealed interface AppRoute {
    data object Hosts : AppRoute
    data object Projects : AppRoute
    data class Tmux(val selectedHostId: String? = null) : AppRoute
    data object Terminals : AppRoute
    data object AddHost : AppRoute
    data class AddRepository(
        val initialHostId: String? = null,
        val initialRemotePath: String? = null,
        val tmuxReturn: TmuxReturn? = null,
    ) : AppRoute
    data object Settings : AppRoute
    data class EditHost(val hostId: String) : AppRoute
    data class HostPorts(val hostId: String) : AppRoute
    data class HostDetail(val hostId: String) : AppRoute
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
        val tmuxReturn: TmuxReturn? = null,
    ) : AppRoute

    companion object {
        fun terminal(
            session: TerminalSessionRecord,
            returnToTerminals: Boolean = false,
            hostDetailReturn: HostDetailReturn? = null,
            tmuxReturn: TmuxReturn? = null,
        ): Terminal =
            Terminal(
                hostId = session.hostId,
                remotePath = session.remotePath,
                repositoryId = session.repositoryId,
                terminalSessionId = session.id,
                returnToTerminals = returnToTerminals,
                hostDetailReturn = hostDetailReturn,
                tmuxReturn = tmuxReturn,
            )
    }
}

internal fun initialMainRoute(): AppRoute = AppRoute.Hosts

internal fun terminalBackgroundRoute(): AppRoute = AppRoute.Terminals

internal fun terminalNotificationRoute(session: TerminalSessionRecord): AppRoute.Terminal =
    AppRoute.terminal(session, returnToTerminals = true)

internal fun projectSetupReturnRoute(route: AppRoute.AddRepository): AppRoute =
    route.tmuxReturn?.let { AppRoute.Tmux(selectedHostId = it.hostId) } ?: AppRoute.Projects

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
    route.tmuxReturn != null -> AppRoute.Tmux(selectedHostId = route.tmuxReturn.hostId)
    route.hostDetailReturn != null -> AppRoute.HostDetail(
        hostId = route.hostDetailReturn.hostId,
    )
    temporary -> AppRoute.Hosts
    else -> AppRoute.EditHost(resolvedHostId)
}
