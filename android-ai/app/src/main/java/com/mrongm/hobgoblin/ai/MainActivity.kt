package com.mrongm.hobgoblin.ai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import com.mrongm.hobgoblin.ai.data.AiConnectionStore
import com.mrongm.hobgoblin.ai.ui.HobAiScreen
import com.mrongm.hobgoblin.ai.ui.HobAiState

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(0x00000000, 0xFFF5F3FD.toInt()),
            navigationBarStyle = SystemBarStyle.light(0x00000000, 0xFFF5F3FD.toInt()),
        )
        val store = AiConnectionStore(applicationContext)
        setContent {
            val state = remember { HobAiState(store) }
            MaterialTheme(colorScheme = HobAiColorScheme) {
                HobAiScreen(state = state, onExit = ::finish)
            }
        }
    }
}

private val HobAiColorScheme = lightColorScheme(
    primary = Color(0xFF5046A6),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEEEBFC),
    onPrimaryContainer = Color(0xFF3D347D),
    background = Color(0xFFFBFAFF),
    onBackground = Color(0xFF22243A),
    surface = Color(0xFFFBFAFF),
    onSurface = Color(0xFF22243A),
    surfaceVariant = Color(0xFFF2EFFD),
    onSurfaceVariant = Color(0xFF5E6279),
    outline = Color(0xFFD7D9E9),
    outlineVariant = Color(0xFFE2E2EE),
    error = Color(0xFF9A3547),
)
