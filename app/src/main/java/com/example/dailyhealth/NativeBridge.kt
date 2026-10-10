package com.example.dailyhealth

import android.app.*
import android.content.Context
import android.os.*
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import java.util.*

class NativeBridge(private val ctx: Context, private val webView: WebView) {

    companion object {
        private var tts: TextToSpeech? = null
        private var ready = false
        private const val CHANNEL_ID = "daily_health"

        fun ensureChannel(c: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = c.getSystemService(NotificationManager::class.java)
                if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                    nm.createNotificationChannel(
                        NotificationChannel(CHANNEL_ID, "日常提醒",
                            NotificationManager.IMPORTANCE_HIGH)
                    )
                }
            }
        }
    }

    init {
        ensureChannel(ctx)
        if (tts == null) {
            tts = TextToSpeech(ctx.applicationContext) { status ->
                ready = (status == TextToSpeech.SUCCESS)
            }
        }
    }

    @JavascriptInterface
    fun speak(text: String, lang: String) {
        if (!ready) return
        val locale = when {
            lang.startsWith("zh") -> Locale.SIMPLIFIED_CHINESE
            lang.startsWith("en") -> Locale.US
            else -> Locale.getDefault()
        }
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "t${System.currentTimeMillis()}")
    }

    @JavascriptInterface
    fun stopSpeak() { tts?.stop() }

    @JavascriptInterface
    fun notify(title: String, body: String) {
        ensureChannel(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val pi = PendingIntent.getActivity(
            ctx, 0, ctx.packageManager.getLaunchIntentForPackage(ctx.packageName),
            PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true).setContentIntent(pi).build()
        nm.notify(System.currentTimeMillis().toInt(), n)
    }

    @JavascriptInterface
    fun vibrate(ms: Long) {
        val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= 26)
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        else @Suppress("DEPRECATION") v.vibrate(ms)
    }

    @JavascriptInterface
    fun requestNotificationPermission() {
        // Android 13+ 已在 onCreate 里请求过；这里只做兜底
        if (Build.VERSION.SDK_INT >= 33) {
            (ctx as? Activity)?.let {
                it.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }
}
