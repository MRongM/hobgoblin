package com.mrongm.hobgoblin.ui.screens.repositories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositorySnapshot
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.ssh.WorktreeMergeBlockReason
import com.mrongm.hobgoblin.ssh.WorktreeMergeSafety
import com.mrongm.hobgoblin.ssh.RemoteWorktreeMergePreflightException
import com.mrongm.hobgoblin.ssh.RemoteWorktreeMergePreflightReason
import com.mrongm.hobgoblin.ssh.evaluateMergeDestination
import com.mrongm.hobgoblin.ssh.evaluateMergeOutSource
import com.mrongm.hobgoblin.ssh.mergeIntoSourceBranches
import com.mrongm.hobgoblin.ssh.mergeOutDestinationWorktrees
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.mrongm.hobgoblin.ui.text.resolve
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing

internal sealed interface WorktreeMergeRequest {
    data class MergeInto(val destination: RemoteRepositoryWorktree) : WorktreeMergeRequest
    data class MergeOut(val source: RemoteRepositoryWorktree) : WorktreeMergeRequest
}

internal fun worktreeMergeTitleText(request: WorktreeMergeRequest): LocalizedText = when (request) {
    is WorktreeMergeRequest.MergeInto -> LocalizedText(
        R.string.repository_worktree_merge_in_title,
        listOf(request.destination.branch.orEmpty()),
    )
    is WorktreeMergeRequest.MergeOut -> LocalizedText(
        R.string.repository_worktree_merge_out_title,
        listOf(request.source.branch.orEmpty()),
    )
}

internal fun worktreeMergeConfirmText(request: WorktreeMergeRequest): LocalizedText = when (request) {
    is WorktreeMergeRequest.MergeInto -> LocalizedText(R.string.repository_worktree_merge_in_confirm)
    is WorktreeMergeRequest.MergeOut -> LocalizedText(R.string.repository_worktree_merge_out_confirm)
}

internal fun worktreeMergeBlockedText(reason: WorktreeMergeBlockReason?): LocalizedText? = when (reason) {
    WorktreeMergeBlockReason.Detached -> LocalizedText(R.string.repository_worktree_merge_detached)
    WorktreeMergeBlockReason.Dirty -> LocalizedText(R.string.repository_worktree_merge_dirty)
    WorktreeMergeBlockReason.Missing -> LocalizedText(R.string.repository_worktree_merge_missing)
    WorktreeMergeBlockReason.Bare -> LocalizedText(R.string.repository_worktree_merge_bare)
    null -> null
}

internal fun worktreeMergeFailureText(failure: Throwable): LocalizedText? {
    val reason = (failure as? RemoteWorktreeMergePreflightException)?.reason ?: return null
    return when (reason) {
        RemoteWorktreeMergePreflightReason.IdentityChanged ->
            LocalizedText(R.string.repository_worktree_merge_identity_changed)
        RemoteWorktreeMergePreflightReason.Detached ->
            LocalizedText(R.string.repository_worktree_merge_detached)
        RemoteWorktreeMergePreflightReason.StatusUnavailable ->
            LocalizedText(R.string.repository_worktree_merge_status_unavailable)
        RemoteWorktreeMergePreflightReason.Dirty ->
            LocalizedText(R.string.repository_worktree_merge_dirty)
        RemoteWorktreeMergePreflightReason.SourceBranchMissing ->
            LocalizedText(R.string.repository_worktree_merge_source_missing)
    }
}

internal fun reprojectWorktreeMergeRequest(
    request: WorktreeMergeRequest,
    snapshot: RemoteRepositorySnapshot,
): WorktreeMergeRequest? {
    val requestPath = when (request) {
        is WorktreeMergeRequest.MergeInto -> request.destination.path
        is WorktreeMergeRequest.MergeOut -> request.source.path
    }
    val currentWorktree = snapshot.worktrees.firstOrNull { it.path == requestPath } ?: return null
    return when (request) {
        is WorktreeMergeRequest.MergeInto -> WorktreeMergeRequest.MergeInto(currentWorktree)
        is WorktreeMergeRequest.MergeOut -> WorktreeMergeRequest.MergeOut(currentWorktree)
    }
}

internal fun worktreeMergeRequestSafety(request: WorktreeMergeRequest): WorktreeMergeSafety = when (request) {
    is WorktreeMergeRequest.MergeInto -> evaluateMergeDestination(request.destination)
    is WorktreeMergeRequest.MergeOut -> evaluateMergeOutSource(request.source)
}

internal fun canConfirmWorktreeMerge(
    request: WorktreeMergeRequest,
    snapshot: RemoteRepositorySnapshot,
    selectedSourceBranch: String?,
    selectedDestinationPath: String?,
    pending: Boolean,
): Boolean {
    if (pending || !worktreeMergeRequestSafety(request).allowed) return false
    return when (request) {
        is WorktreeMergeRequest.MergeInto ->
            selectedSourceBranch in mergeIntoSourceBranches(snapshot, request.destination)
        is WorktreeMergeRequest.MergeOut -> mergeOutDestinationWorktrees(snapshot, request.source)
            .firstOrNull { it.worktree.path == selectedDestinationPath }
            ?.safety
            ?.allowed == true
    }
}

@Composable
internal fun WorktreeMergeDialog(
    request: WorktreeMergeRequest,
    snapshot: RemoteRepositorySnapshot,
    pending: Boolean,
    error: String?,
    onMergeInto: (RemoteRepositoryWorktree, String) -> Unit,
    onMergeOut: (RemoteRepositoryWorktree, RemoteRepositoryWorktree) -> Unit,
    onDismiss: () -> Unit,
) {
    var menuExpanded by remember(request) { mutableStateOf(false) }
    var selectedSourceBranch by remember(request) { mutableStateOf<String?>(null) }
    var selectedDestinationPath by remember(request) { mutableStateOf<String?>(null) }
    val requestSafety = worktreeMergeRequestSafety(request)
    val sourceBranches = when (request) {
        is WorktreeMergeRequest.MergeInto -> mergeIntoSourceBranches(snapshot, request.destination)
        is WorktreeMergeRequest.MergeOut -> emptyList()
    }
    val destinations = when (request) {
        is WorktreeMergeRequest.MergeInto -> emptyList()
        is WorktreeMergeRequest.MergeOut -> mergeOutDestinationWorktrees(snapshot, request.source)
    }
    val selectedDestination = destinations.firstOrNull { it.worktree.path == selectedDestinationPath }
    val selectionLabel = when (request) {
        is WorktreeMergeRequest.MergeInto -> selectedSourceBranch
            ?: stringResource(R.string.repository_worktree_merge_select_source)
        is WorktreeMergeRequest.MergeOut -> selectedDestination?.worktree?.branch
            ?: stringResource(R.string.repository_worktree_merge_select_destination)
    }
    val confirmEnabled = canConfirmWorktreeMerge(
        request = request,
        snapshot = snapshot,
        selectedSourceBranch = selectedSourceBranch,
        selectedDestinationPath = selectedDestinationPath,
        pending = pending,
    )

    AlertDialog(
        onDismissRequest = { if (!pending) onDismiss() },
        title = { Text(worktreeMergeTitleText(request).resolve()) },
        text = {
            Column {
                Box {
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { menuExpanded = true },
                        enabled = !pending && requestSafety.allowed &&
                            (sourceBranches.isNotEmpty() || destinations.isNotEmpty()),
                    ) {
                        Text(selectionLabel)
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        sourceBranches.forEach { sourceBranch ->
                            DropdownMenuItem(
                                text = { Text(sourceBranch) },
                                onClick = {
                                    selectedSourceBranch = sourceBranch
                                    menuExpanded = false
                                },
                            )
                        }
                        destinations.forEach { destination ->
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(destination.worktree.branch ?: destination.worktree.path)
                                        Text(
                                            destination.worktree.path,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        worktreeMergeBlockedText(destination.safety.blockReason)?.let { reason ->
                                            Text(
                                                reason.resolve(),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        }
                                    }
                                },
                                onClick = {
                                    selectedDestinationPath = destination.worktree.path
                                    menuExpanded = false
                                },
                                enabled = destination.safety.allowed,
                            )
                        }
                    }
                }
                worktreeMergeBlockedText(requestSafety.blockReason)?.let { reason ->
                    Text(
                        reason.resolve(),
                        modifier = Modifier.padding(top = HobgoblinSpacing.Sm),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                error?.let { message ->
                    Text(
                        message,
                        modifier = Modifier.padding(top = HobgoblinSpacing.Sm),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (sourceBranches.isEmpty() && request is WorktreeMergeRequest.MergeInto) {
                    Text(
                        stringResource(R.string.repository_worktree_merge_no_sources),
                        modifier = Modifier.padding(top = HobgoblinSpacing.Sm),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (destinations.isEmpty() && request is WorktreeMergeRequest.MergeOut) {
                    Text(
                        stringResource(R.string.repository_worktree_merge_no_destinations),
                        modifier = Modifier.padding(top = HobgoblinSpacing.Sm),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    when (request) {
                        is WorktreeMergeRequest.MergeInto -> selectedSourceBranch?.let { sourceBranch ->
                            onMergeInto(request.destination, sourceBranch)
                        }
                        is WorktreeMergeRequest.MergeOut -> selectedDestination?.worktree?.let { destination ->
                            onMergeOut(request.source, destination)
                        }
                    }
                },
                enabled = confirmEnabled,
            ) {
                Text(worktreeMergeConfirmText(request).resolve())
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !pending) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}
