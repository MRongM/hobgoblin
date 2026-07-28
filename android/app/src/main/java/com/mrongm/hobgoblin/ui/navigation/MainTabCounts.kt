package com.mrongm.hobgoblin.ui.navigation

import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord

internal fun projectCountsByHostId(
    repositories: List<RemoteRepositoryProfile>,
): Map<String, Int> = repositories
    .groupingBy(RemoteRepositoryProfile::hostProfileId)
    .eachCount()

internal fun terminalCountsByProjectId(
    sessions: List<TerminalSessionRecord>,
): Map<String, Int> = sessions
    .mapNotNull(TerminalSessionRecord::repositoryId)
    .groupingBy { it }
    .eachCount()
