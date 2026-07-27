package com.mrongm.hobgoblin.terminals

data class TerminalNavigationRequest(
    val sessionId: String,
    val sequence: Long,
)
