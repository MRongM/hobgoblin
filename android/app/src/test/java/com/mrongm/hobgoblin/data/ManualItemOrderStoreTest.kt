package com.mrongm.hobgoblin.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ManualItemOrderStoreTest {
    @Test
    fun `saved order keeps known items and appends unseen source items`() {
        val items = listOf("a", "b", "c")

        val ordered = ManualItemOrderPolicy.apply(
            items = items,
            savedIds = listOf("stale", "b", "a"),
            idOf = { it },
        )

        assertEquals(listOf("b", "a", "c"), ordered)
    }

    @Test
    fun `saved order deduplicates ids without duplicating items`() {
        val ordered = ManualItemOrderPolicy.apply(
            items = listOf("a", "b", "c"),
            savedIds = listOf("b", "b", "a"),
            idOf = { it },
        )

        assertEquals(listOf("b", "a", "c"), ordered)
    }

    @Test
    fun `move places dragged id at the target index`() {
        assertEquals(
            listOf("b", "c", "a"),
            ManualItemOrderPolicy.move(listOf("a", "b", "c"), draggedId = "a", targetId = "c"),
        )
        assertEquals(
            listOf("c", "a", "b"),
            ManualItemOrderPolicy.move(listOf("a", "b", "c"), draggedId = "c", targetId = "a"),
        )
    }

    @Test
    fun `move ignores missing or identical ids`() {
        val ids = listOf("a", "b", "c")

        assertEquals(ids, ManualItemOrderPolicy.move(ids, draggedId = "missing", targetId = "b"))
        assertEquals(ids, ManualItemOrderPolicy.move(ids, draggedId = "a", targetId = "missing"))
        assertEquals(ids, ManualItemOrderPolicy.move(ids, draggedId = "b", targetId = "b"))
    }

    @Test
    fun `manual order ids round trip and malformed records are ignored`() {
        val ids = listOf("host-1", "/srv/app feature", "终端-1")
        val payload = ManualItemOrderCodec.encode(ids)

        assertEquals(ids, ManualItemOrderCodec.decode(payload))
        assertEquals(ids, ManualItemOrderCodec.decode("$payload\n%%%"))
    }

    @Test
    fun `manual order scope keys isolate every list and project worktrees`() {
        assertEquals("hosts", ManualItemOrderScope.Hosts.storageKey)
        assertEquals("projects", ManualItemOrderScope.Projects.storageKey)
        assertEquals(
            "worktrees:cHJvamVjdC0x",
            ManualItemOrderScope.Worktrees("project-1").storageKey,
        )
        assertEquals(
            "worktrees:cHJvamVjdC0y",
            ManualItemOrderScope.Worktrees("project-2").storageKey,
        )
    }
}
