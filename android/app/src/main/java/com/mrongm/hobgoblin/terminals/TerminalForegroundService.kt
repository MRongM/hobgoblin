package com.mrongm.hobgoblin.terminals

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.mrongm.hobgoblin.MainActivity
import com.mrongm.hobgoblin.R

class TerminalForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ActionStop) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val applicationLanguageContext = forApplicationLanguage()
        val content = ResolvedTerminalNotificationContent(
            title = intent?.getStringExtra(ExtraTitle)
                ?: applicationLanguageContext.getString(R.string.notification_terminal_running),
            text = intent?.getStringExtra(ExtraText)
                ?: applicationLanguageContext.getString(R.string.notification_terminal_session_active),
            terminalSessionId = intent?.getStringExtra(TerminalSessionIntentExtra),
        )
        ServiceCompat.startForeground(
            this,
            TerminalNotificationFactory.NotificationId,
            buildNotification(content, applicationLanguageContext),
            foregroundServiceType(),
        )
        return START_STICKY
    }

    private fun buildNotification(
        content: ResolvedTerminalNotificationContent,
        applicationLanguageContext: Context,
    ): Notification {
        ensureChannel(applicationLanguageContext)
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            content.terminalSessionId?.let { putExtra(TerminalSessionIntentExtra, it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            TerminalNotificationFactory.NotificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, TerminalNotificationFactory.ChannelId)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(content.title)
            .setContentText(content.text)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setShowWhen(false)
            .build()
    }

    private fun ensureChannel(applicationLanguageContext: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            TerminalNotificationFactory.ChannelId,
            applicationLanguageContext.getString(R.string.notification_terminal_channel),
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun foregroundServiceType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }

    companion object {
        private const val ActionStartOrUpdate = "com.mrongm.hobgoblin.terminals.START_OR_UPDATE"
        private const val ActionStop = "com.mrongm.hobgoblin.terminals.STOP"
        private const val ExtraTitle = "com.mrongm.hobgoblin.terminals.extra.TITLE"
        private const val ExtraText = "com.mrongm.hobgoblin.terminals.extra.TEXT"

        fun startIntent(context: Context, content: TerminalNotificationContent): Intent =
            Intent(context, TerminalForegroundService::class.java).apply {
                action = ActionStartOrUpdate
                putExtra(ExtraTitle, context.resolve(content.title))
                putExtra(ExtraText, context.resolve(content.text))
                content.terminalSessionId?.let { putExtra(TerminalSessionIntentExtra, it) }
            }

        fun stopIntent(context: Context): Intent =
            Intent(context, TerminalForegroundService::class.java).apply {
                action = ActionStop
            }
    }
}

private data class ResolvedTerminalNotificationContent(
    val title: String,
    val text: String,
    val terminalSessionId: String?,
)

private fun Context.resolve(text: TerminalNotificationText): String =
    forApplicationLanguage().getString(text.resourceId, *text.formatArgs.toTypedArray())

private fun Context.forApplicationLanguage(): Context =
    ContextCompat.getContextForLanguage(this)
