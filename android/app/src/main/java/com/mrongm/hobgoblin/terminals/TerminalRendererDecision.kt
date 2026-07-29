package com.mrongm.hobgoblin.terminals

data class TerminalRendererDecision(
    val selectedRenderer: String = "Compose native text viewport",
    val fallbackAllowedOnlyAfterNativeFailure: Boolean = true,
)

