package com.mrongm.hobgoblin.ai.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HobAiAddressTest {
    @Test
    fun `addresses normalize to a single HTTPS origin`() {
        assertEquals("https://hob.example.com", aiServerOrigin(" HTTPS://Hob.Example.COM:443/ "))
        assertEquals("https://hob.example.com:9443", aiServerOrigin("https://hob.example.com:9443"))
        assertEquals("https://[fd00::1]:9443", aiServerOrigin("https://[fd00::1]:9443"))
    }

    @Test
    fun `credentials are scoped to an explicit HTTPS origin`() {
        listOf(
            "http://hob.example.com",
            "https://user@hob.example.com",
            "https://hob.example.com/api",
            "https://hob.example.com?query",
            "https://hob.example.com#fragment",
            "https://hob.example.com:65536",
        ).forEach { assertNull(aiServerOrigin(it)) }
    }

    @Test
    fun `local addresses can request the Android LAN permission at connection time`() {
        assertTrue(isAiLanAddress("https://hob.local"))
        assertTrue(isAiLanAddress("https://192.168.1.2"))
        assertTrue(isAiLanAddress("https://[fd00::1]"))
        assertFalse(isAiLanAddress("https://hob.example.com"))
        assertFalse(isAiLanAddress("https://172.32.1.2"))
        assertFalse(isAiLanAddress("https://10.example.1.2.3.com"))
    }
}
