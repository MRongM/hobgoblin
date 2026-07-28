package com.mrongm.hobgoblin.ui.screens.settings

import java.io.File
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

    @Test
    fun `localized privacy policies disclose private key export protection boundary`() {
        val privacyDirectory = File(repositoryRoot(), "docs/privacy")
        val expectedDisclosureByFile = mapOf(
            "index.html" to "the exported document is outside Hobgoblin's encrypted private app storage",
            "zh-cn.html" to "导出的文档不再受 Hobgoblin 应用内加密私有存储保护",
            "ja.html" to "エクスポートした文書は Hobgoblin の暗号化された非公開アプリストレージの保護対象外",
            "ko.html" to "내보낸 문서는 Hobgoblin의 암호화된 비공개 앱 저장소 보호를 받지 않습니다",
        )

        expectedDisclosureByFile.forEach { (fileName, disclosure) ->
            val policy = File(privacyDirectory, fileName)
            assertTrue("Missing privacy policy: ${policy.path}", policy.isFile)
            assertTrue("Missing private key export disclosure in $fileName", policy.readText().contains(disclosure))
        }
    }

    private fun repositoryRoot(): File = listOf(File("../.."), File(".."), File("."))
        .firstOrNull { File(it, "docs/privacy/index.html").isFile }
        ?: error("Repository root not found from ${File(".").absolutePath}")
}
