package com.mrongm.hobgoblin.ai.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.sin

internal val AiPaper = Color(0xFFFBFAFF)
internal val AiAccent = Color(0xFF5046A6)
internal val AiAccentSoft = Color(0xFFEEEBFC)
internal val AiLine = Color(0xFFE2E2EE)
internal val AiMuted = Color(0xFF5E6279)
internal val AiRunningSurface = Color(0xFFECF6F1)
internal val AiRunningInk = Color(0xFF256452)

internal enum class AiIcon { Menu, Back, Next, Plus, Settings, Chat, Folder, Branch, Send, Stop, Close, Check, Refresh, Delete, Terminal }

@Composable
internal fun HobIcon(icon: AiIcon, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) {
    Canvas(modifier.size(20.dp)) {
        scale(size.width / 20f, size.height / 20f, pivot = Offset.Zero) {
            fun segment(x1: Float, y1: Float, x2: Float, y2: Float) {
                drawLine(tint, Offset(x1, y1), Offset(x2, y2), strokeWidth = 1.6f, cap = StrokeCap.Round)
            }
            fun outline(left: Float, top: Float, width: Float, height: Float, radius: Float) {
                drawRoundRect(tint, Offset(left, top), Size(width, height), CornerRadius(radius), style = Stroke(1.4f))
            }
            when (icon) {
                AiIcon.Menu -> {
                    segment(3f, 5f, 17f, 5f)
                    segment(3f, 9f, 17f, 9f)
                    segment(3f, 13f, 12f, 13f)
                }
                AiIcon.Back, AiIcon.Next -> {
                    val tip = if (icon == AiIcon.Back) 7f else 13f
                    val tail = if (icon == AiIcon.Back) 12f else 8f
                    segment(tail, 5f, tip, 10f)
                    segment(tip, 10f, tail, 15f)
                }
                AiIcon.Plus -> {
                    segment(4f, 10f, 16f, 10f)
                    segment(10f, 4f, 10f, 16f)
                }
                AiIcon.Terminal -> {
                    outline(2f, 4f, 16f, 12f, 2f)
                    segment(5f, 8f, 8f, 10f)
                    segment(8f, 10f, 5f, 12f)
                    segment(10f, 12f, 14f, 12f)
                }
                AiIcon.Settings -> {
                    drawCircle(tint, 5.2f, Offset(10f, 10f), style = Stroke(1.5f))
                    drawCircle(tint, 1.8f, Offset(10f, 10f), style = Stroke(1.3f))
                    repeat(8) { index ->
                        val angle = index * Math.PI / 4
                        val x = cos(angle).toFloat()
                        val y = sin(angle).toFloat()
                        segment(10f + x * 5.5f, 10f + y * 5.5f, 10f + x * 7.4f, 10f + y * 7.4f)
                    }
                }
                AiIcon.Chat -> {
                    val bubble = Path().apply {
                        moveTo(5f, 3f)
                        lineTo(15f, 3f)
                        quadraticTo(17.5f, 3f, 17.5f, 5.5f)
                        lineTo(17.5f, 12f)
                        quadraticTo(17.5f, 14.5f, 15f, 14.5f)
                        lineTo(9f, 14.5f)
                        lineTo(5f, 17.5f)
                        lineTo(5f, 14.5f)
                        quadraticTo(2.5f, 14.5f, 2.5f, 12f)
                        lineTo(2.5f, 5.5f)
                        quadraticTo(2.5f, 3f, 5f, 3f)
                        close()
                    }
                    drawPath(bubble, tint, style = Stroke(1.4f))
                }
                AiIcon.Folder -> {
                    outline(3f, 6f, 14f, 10f, 1.7f)
                    segment(3f, 6f, 3f, 4f)
                    segment(3f, 4f, 9f, 4f)
                    segment(9f, 4f, 11f, 6f)
                }
                AiIcon.Branch -> {
                    val branch = Path().apply {
                        moveTo(6f, 16f)
                        lineTo(6f, 5f)
                        moveTo(6f, 12f)
                        lineTo(10f, 12f)
                        quadraticTo(14f, 12f, 14f, 8f)
                        lineTo(14f, 5f)
                    }
                    drawPath(branch, tint, style = Stroke(1.6f, cap = StrokeCap.Round))
                }
                AiIcon.Send -> {
                    segment(10f, 16f, 10f, 4f)
                    segment(4.5f, 9.5f, 10f, 4f)
                    segment(10f, 4f, 15.5f, 9.5f)
                }
                AiIcon.Stop -> drawRoundRect(tint, Offset(5f, 5f), Size(10f, 10f), CornerRadius(1.3f))
                AiIcon.Close -> {
                    segment(5f, 5f, 15f, 15f)
                    segment(15f, 5f, 5f, 15f)
                }
                AiIcon.Check -> {
                    segment(4f, 10f, 8f, 14f)
                    segment(8f, 14f, 16f, 6f)
                }
                AiIcon.Refresh -> {
                    drawArc(
                        tint, 52f, 308f, false, Offset(2f, 3f), Size(14f, 14f),
                        style = Stroke(1.6f, cap = StrokeCap.Round),
                    )
                    segment(13.5f, 7.5f, 16f, 10f)
                    segment(18.5f, 7.5f, 16f, 10f)
                }
                AiIcon.Delete -> {
                    segment(3.5f, 6f, 16.5f, 6f)
                    segment(7.5f, 4f, 12.5f, 4f)
                    segment(5.5f, 6f, 6.5f, 16f)
                    segment(14.5f, 6f, 13.5f, 16f)
                    segment(6.5f, 16f, 13.5f, 16f)
                }
            }
        }
    }
}

@Composable
internal fun HobIconButton(
    icon: AiIcon,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    background: Color = Color.Transparent,
    tint: Color = AiMuted,
) {
    Box(
        modifier.size(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(background)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        HobIcon(icon, tint = if (enabled) tint else tint.copy(alpha = .45f))
    }
}

@Composable
internal fun HobTopBar(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    leading: @Composable () -> Unit = {},
    trailing: @Composable () -> Unit = {},
) {
    Column(modifier.fillMaxWidth().background(AiPaper)) {
        Row(
            Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading()
            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                subtitle?.let { Text(it, color = AiMuted, fontSize = 11.sp, lineHeight = 14.sp) }
            }
            trailing()
        }
        HorizontalDivider(color = AiLine)
    }
}

@Composable
internal fun HobPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: AiIcon? = null,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 44.dp),
        shape = RoundedCornerShape(13.dp),
        contentPadding = PaddingValues(horizontal = 13.dp, vertical = 7.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            icon?.let { HobIcon(it, Modifier.size(16.dp)) }
            Text(label, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

@Composable
internal fun HobField(
    value: String,
    onChange: (String) -> Unit,
    hint: String,
    label: String = hint,
    enabled: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    val shape = RoundedCornerShape(11.dp)
    BasicTextField(
        value = value,
        onValueChange = onChange,
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
        enabled = enabled,
        keyboardOptions = keyboardOptions,
        visualTransformation = visualTransformation,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
        cursorBrush = SolidColor(AiAccent),
        decorationBox = { field ->
            Box(
                Modifier.heightIn(min = 45.dp).clip(shape).background(Color.White)
                    .border(1.dp, Color(0xFFD7D9E9), shape).padding(horizontal = 11.dp, vertical = 8.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty() && hint.isNotEmpty()) Text(hint, color = AiMuted, fontSize = 14.sp)
                field()
            }
        },
    )
}

@Composable
internal fun HobMark(label: String, size: Int = 35, running: Boolean = false) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(if (size > 30) 10.dp else 7.dp))
            .background(if (running) Color(0xFFD9EDE4) else AiAccentSoft),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (running) AiRunningInk else AiAccent,
            fontSize = if (size > 30) 16.sp else 11.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
internal fun HobStatusDot() {
    Box(Modifier.size(12.dp).clip(CircleShape).background(Color(0xFFCFE7DE)), contentAlignment = Alignment.Center) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(Color(0xFF477967)))
    }
}

@Composable
internal fun HobNavItem(
    label: String,
    icon: AiIcon,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.height(55.dp).selectable(selected, role = Role.Tab, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(width = 38.dp, height = 23.dp).clip(RoundedCornerShape(10.dp))
                .background(if (selected) AiAccentSoft else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            HobIcon(icon, Modifier.size(17.dp), if (selected) AiAccent else AiMuted)
        }
        Text(label, color = if (selected) AiAccent else AiMuted, fontSize = 10.sp, lineHeight = 14.sp)
    }
}
