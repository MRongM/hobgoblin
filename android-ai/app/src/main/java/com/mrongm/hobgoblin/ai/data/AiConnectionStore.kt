package com.mrongm.hobgoblin.ai.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal enum class AiRefreshInterval(val seconds: Int) {
    Every3Seconds(3), Every5Seconds(5), Every15Seconds(15), Every30Seconds(30), Manual(0),
}

internal class AiConnectionStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("hob-ai", Context.MODE_PRIVATE)

    suspend fun load(): AiConnection? = withContext(Dispatchers.IO) {
        val origin = prefs.getString(Origin, null)?.let(::aiServerOrigin) ?: return@withContext null
        val iv = prefs.getString(Iv, null) ?: return@withContext null
        val ciphertext = prefs.getString(Ciphertext, null) ?: return@withContext null
        val cipher = Cipher.getInstance(Transformation)
        val key = keyStore().getKey(KeyAlias, null) as? SecretKey ?: return@withContext null
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.getDecoder().decode(iv)))
        cipher.updateAAD(origin.toByteArray(Charsets.UTF_8))
        AiConnection(origin, cipher.doFinal(Base64.getDecoder().decode(ciphertext)).toString(Charsets.UTF_8))
    }

    suspend fun save(connection: AiConnection) = withContext(Dispatchers.IO) {
        val cipher = Cipher.getInstance(Transformation)
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        cipher.updateAAD(connection.origin.toByteArray(Charsets.UTF_8))
        val payload = connection.accessKey.toByteArray(Charsets.UTF_8)
        val ciphertext = try {
            cipher.doFinal(payload)
        } finally {
            payload.fill(0)
        }
        val edit = prefs.edit()
            .putString(Origin, connection.origin)
            .putString(Iv, Base64.getEncoder().encodeToString(cipher.iv))
            .putString(Ciphertext, Base64.getEncoder().encodeToString(ciphertext))
        if (prefs.getString(Origin, null) != connection.origin) edit.remove(LastSession)
        check(edit.commit()) { "Unable to save the Hob AI connection" }
    }

    fun lastSessionId(): String? = prefs.getString(LastSession, null)

    fun refreshInterval(): AiRefreshInterval {
        val default = AiRefreshInterval.Every5Seconds
        val seconds = prefs.getInt(RefreshSeconds, default.seconds)
        return AiRefreshInterval.entries.firstOrNull { it.seconds == seconds } ?: default
    }

    fun setRefreshInterval(interval: AiRefreshInterval) {
        prefs.edit().putInt(RefreshSeconds, interval.seconds).apply()
    }

    fun rememberSession(sessionId: String?) {
        prefs.edit().putString(LastSession, sessionId).apply()
    }

    fun terminalCursor(origin: String, id: String): Long =
        prefs.getLong("terminal-cursor:$origin:$id", 0L)

    fun rememberTerminalCursor(origin: String, id: String, seq: Long) {
        prefs.edit().putLong("terminal-cursor:$origin:$id", seq).apply()
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(AndroidKeyStore).apply { load(null) }

    private fun encryptionKey(): SecretKey =
        (keyStore().getKey(KeyAlias, null) as? SecretKey) ?: KeyGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_AES, AndroidKeyStore)
            .apply {
                init(
                    KeyGenParameterSpec.Builder(KeyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build(),
                )
            }
            .generateKey()

    private companion object {
        const val AndroidKeyStore = "AndroidKeyStore"
        const val KeyAlias = "hobgoblin-ai-access-key"
        const val Transformation = "AES/GCM/NoPadding"
        const val Origin = "origin"
        const val Iv = "iv"
        const val Ciphertext = "ciphertext"
        const val LastSession = "last-session"
        const val RefreshSeconds = "refresh-seconds"
    }
}
