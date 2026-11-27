package com.mrongm.hobgoblin.ai.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AiSessionPresentationTest {
    @Test
    fun distinguishesSessionsWithoutAUserMessage() {
        val first = session("11111111-1111-4111-8111-111111111111")
        val second = session("22222222-2222-4222-8222-222222222222")

        assertNotEquals(first.title, second.title)
        assertEquals("Codex · 111111", first.title)
    }

    @Test
    fun prefersRequestTextOverAttachmentMarkersAndLocalPaths() {
        val item = session("11111111-1111-4111-8111-111111111111").copy(
            turn = AiTurn("request-id", "completed", "/home/example/image.png", null),
            messages = listOf(AiMessage("user", "[Image #1] Check the terminal layout")),
        )

        assertEquals("Check the terminal layout", item.title)
    }

    @Test
    fun refreshesTheLoadedPagesAndKeepsTheNewCursor() = runBlocking {
        val requests = mutableListOf<String?>()
        val first = session("11111111-1111-4111-8111-111111111111")
        val second = session("22222222-2222-4222-8222-222222222222")
        val result = fetchAiSessionWindow(2) { cursor ->
            requests += cursor
            when (cursor) {
                null -> AiSessionPage(listOf(first), emptyList(), "refreshed-page-one")
                "refreshed-page-one" -> AiSessionPage(listOf(second), emptyList(), "refreshed-page-two")
                else -> error("Requested an unseen page")
            }
        }

        assertEquals(listOf(null, "refreshed-page-one"), requests)
        assertEquals(listOf(first, second), result.sessions)
        assertEquals("refreshed-page-two", result.nextCursor)
    }

    @Test
    fun usesTheTerminalTitleWhenPresentAndFallsBackToTheWorkingDirectory() {
        val row = AiTerminalRecord("term_example", "/work/project", "open", "", null, "  Run tests  ")

        assertEquals("Run tests", row.title)
        assertEquals("project", row.copy(terminalTitle = " ").title)
        assertEquals("project", row.copy(cwd = "C:\\Work\\project", terminalTitle = null).title)
    }

    @Test
    fun preservesTheTerminalTitleAndOmitsAnExactDirectorySuffixInTheList() {
        val row = AiTerminalRecord("term_example", "/work/project", "open", "", AiProvider.Codex, "Build docs | project")

        assertEquals("Build docs", row.listTitle)
        assertEquals("Build docs | project", row.title)
        assertEquals("Build docs", row.copy(terminalTitle = "Build docs | /work/project").listTitle)
        assertEquals("Review | integration", row.copy(terminalTitle = "Review | integration").listTitle)
        assertEquals(null, row.copy(terminalTitle = "project").listTitle)
        assertEquals(null, row.copy(terminalTitle = null).listTitle)
    }

    private fun session(id: String) = AiSession(id, "workspace", "worktree", AiProvider.Codex, "", "ready", null, emptyList())
}
