package com.mrongm.hobgoblin.ui.screens.settings

import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PrivacyPolicyTest {
    @Test
    fun `privacy policy uses the canonical public HTTPS page`() {
        val uri = URI(PrivacyPolicy.url)

        assertEquals("https", uri.scheme)
        assertEquals("mrongm.github.io", uri.host)
        assertEquals("/hobgoblin/privacy/", uri.path)
        assertTrue(uri.query.isNullOrEmpty())
        assertTrue(uri.fragment.isNullOrEmpty())
    }
}
