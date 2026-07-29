package com.mrongm.hobgoblin.ui.screens.repositories

import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryBranch
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositorySnapshot
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.ssh.WorktreeMergeBlockReason
import com.mrongm.hobgoblin.ssh.RemoteWorktreeMergePreflightException
import com.mrongm.hobgoblin.ssh.RemoteWorktreeMergePreflightReason
import com.mrongm.hobgoblin.ui.text.LocalizedText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class WorktreeMergeDialogStateTest {
    @Test
    fun `merge dialog directions map to explicit localized titles and confirmations`() {
        val worktree = worktree()

        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_in_title, listOf("feature/android")),
            worktreeMergeTitleText(WorktreeMergeRequest.MergeInto(worktree)),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_in_confirm),
            worktreeMergeConfirmText(WorktreeMergeRequest.MergeInto(worktree)),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_out_title, listOf("feature/android")),
            worktreeMergeTitleText(WorktreeMergeRequest.MergeOut(worktree)),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_out_confirm),
            worktreeMergeConfirmText(WorktreeMergeRequest.MergeOut(worktree)),
        )
    }

    @Test
    fun `merge blockers map to localized explanations`() {
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_detached),
            worktreeMergeBlockedText(WorktreeMergeBlockReason.Detached),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_dirty),
            worktreeMergeBlockedText(WorktreeMergeBlockReason.Dirty),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_missing),
            worktreeMergeBlockedText(WorktreeMergeBlockReason.Missing),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_bare),
            worktreeMergeBlockedText(WorktreeMergeBlockReason.Bare),
        )
    }

    @Test
    fun `remote merge preflight failures map to localized messages`() {
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_identity_changed),
            worktreeMergeFailureText(
                RemoteWorktreeMergePreflightException(RemoteWorktreeMergePreflightReason.IdentityChanged),
            ),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_status_unavailable),
            worktreeMergeFailureText(
                RemoteWorktreeMergePreflightException(RemoteWorktreeMergePreflightReason.StatusUnavailable),
            ),
        )
        assertEquals(
            LocalizedText(R.string.repository_worktree_merge_source_missing),
            worktreeMergeFailureText(
                RemoteWorktreeMergePreflightException(RemoteWorktreeMergePreflightReason.SourceBranchMissing),
            ),
        )
        assertNull(worktreeMergeFailureText(IllegalArgumentException("CONFLICT")))
    }

    @Test
    fun `merge request is reprojected by path onto the latest worktree state`() {
        val original = worktree()
        val updated = original.copy(isDirty = true, changeCount = 2)
        val request = WorktreeMergeRequest.MergeInto(original)

        val reprojected = reprojectWorktreeMergeRequest(request, snapshot(listOf(updated)))

        require(reprojected is WorktreeMergeRequest.MergeInto)
        assertEquals(updated, reprojected.destination)
        assertEquals(WorktreeMergeBlockReason.Dirty, worktreeMergeRequestSafety(reprojected).blockReason)
        assertFalse(canConfirmWorktreeMerge(reprojected, snapshot(listOf(updated)), "main", null, pending = false))
    }

    @Test
    fun `merge request disappears when its worktree path is no longer in the snapshot`() {
        val request = WorktreeMergeRequest.MergeOut(worktree())

        assertNull(reprojectWorktreeMergeRequest(request, snapshot(emptyList())))
    }

    @Test
    fun `merge into cannot confirm a source branch removed by snapshot refresh`() {
        val request = WorktreeMergeRequest.MergeInto(worktree())

        assertFalse(canConfirmWorktreeMerge(request, snapshot(listOf(worktree())), "removed/branch", null, pending = false))
    }

    private fun snapshot(worktrees: List<RemoteRepositoryWorktree>): RemoteRepositorySnapshot =
        RemoteRepositorySnapshot(
            currentRef = "main",
            defaultBranch = "main",
            statusLines = emptyList(),
            statusChangeCount = 0,
            branches = listOf(
                RemoteRepositoryBranch("main", isCurrent = true, isDefault = true, worktreePath = "/srv/app"),
                RemoteRepositoryBranch(
                    "feature/android",
                    isCurrent = false,
                    isDefault = false,
                    worktreePath = "/srv/app-feature",
                ),
            ),
            commits = emptyList(),
            worktrees = worktrees,
        )

    private fun worktree(): RemoteRepositoryWorktree = RemoteRepositoryWorktree(
        path = "/srv/app-feature",
        branch = "feature/android",
        isPrimary = false,
        isLinked = true,
        isBare = false,
        isLocked = false,
        isMissing = false,
        isDirty = false,
        changeCount = 0,
    )
}
