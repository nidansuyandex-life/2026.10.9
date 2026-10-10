package com.example.dailyhealth

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var tts: TextToSpeech? = null
    private lateinit var prefs: android.content.SharedPreferences

    private val speechLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK && result.data != null) {
            val list = result.data!!.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            if (!list.isNullOrEmpty()) {
                val text = list[0].replace("'", "\\'")
                webView.evaluateJavascript(
                    "window.__onSpeechResult&&window.__onSpeechResult('$text',true)", null
                )
            } else {
                webView.evaluateJavascript("window.__onSpeechEnd&&window.__onSpeechEnd()", null)
            }
        } else {
            webView.evaluateJavascript("window.__onSpeechEnd&&window.__onSpeechEnd()", null)
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences("daily_health", Context.MODE_PRIVATE)

        // 申请运行时权限（麦克风、通知、定位）
        requestRuntimePermissions()

        // 初始化 TTS
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) {
                        runOnUiThread {
                            webView.evaluateJavascript(
                                "window.__onTTSDone&&window.__onTTSDone('${utteranceId ?: ""}')", null
                            )
                        }
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        runOnUiThread {
                            webView.evaluateJavascript(
                                "window.__onTTSError&&window.__onTTSError('${utteranceId ?: ""}','error')", null
                            )
                        }
                    }
                })
            }
        }

        // WebView 初始化
        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false   // 允许 JS 直接播放音频
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        // 注册原生接口
        webView.addJavascriptInterface(NativeTTS(), "AndroidTTS")
        webView.addJavascriptInterface(NativeSTT(), "AndroidSTT")
        webView.addJavascriptInterface(NativeStore(), "AndroidStore")
        webView.addJavascriptInterface(NativeFile(), "AndroidFile")
        webView.addJavascriptInterface(NativeNotify(), "AndroidNotify")
        webView.addJavascriptInterface(NativeOpen(), "AndroidOpen")

        webView.loadUrl("file:///android_asset/index.html")
    }

    // ==================== 运行时权限 ====================
    private fun requestRuntimePermissions() {
        val perms = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) perms.add(Manifest.permission.RECORD_AUDIO)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) perms.add(Manifest.permission.ACCESS_FINE_LOCATION)

        if (perms.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1001)
        }
    }

    // ==================== TTS ====================
    inner class NativeTTS {
        @JavascriptInterface
        fun speak(text: String?, lang: String?, uid: String?) {
            val t = tts ?: return
            val locale = if (lang != null && lang.startsWith("zh")) Locale.CHINA else Locale.US
            t.language = locale
            t.speak(text ?: "", TextToSpeech.QUEUE_FLUSH, null, uid ?: "u")
        }

        @JavascriptInterface
        fun stop() {
            tts?.stop()
        }
    }

    // ==================== STT ====================
    inner class NativeSTT {
        @JavascriptInterface
        fun start(lang: String?) {
            runOnUiThread {
                try {
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                        )
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang ?: "zh-CN")
                        putExtra(RecognizerIntent.EXTRA_PROMPT, "请说出您要记的账")
                    }
                    speechLauncher.launch(intent)
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "设备不支持语音识别", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun stop() {}
    }

    // ==================== 存储 ====================
    inner class NativeStore {
        @JavascriptInterface
        fun get(key: String?): String? = prefs.getString(key, null)

        @JavascriptInterface
        fun set(key: String?, value: String?) {
            prefs.edit().putString(key, value).apply()
        }

        @JavascriptInterface
        fun remove(key: String?) {
            prefs.edit().remove(key).apply()
        }

        @JavascriptInterface
        fun keys(): String {
            val arr = JSONArray()
            for (k in prefs.all.keys) arr.put(k)
            return arr.toString()
        }
    }

    // ==================== 文件 ====================
    inner class NativeFile {
        @JavascriptInterface
        fun saveFile(content: String?, filename: String?, mime: String?) {
            try {
                val dir = getExternalFilesDir(null) ?: filesDir
                val f = File(dir, filename ?: "export.txt")
                FileOutputStream(f).use { it.write((content ?: "").toByteArray(Charsets.UTF_8)) }
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__onFileSaved&&window.__onFileSaved('${filename ?: ""}')", null
                    )
                }
            } catch (e: Exception) {
                runOnUiThread {
                    val msg = e.message?.replace("'", "\\'") ?: "unknown"
                    webView.evaluateJavascript(
                        "window.__onFileSaveError&&window.__onFileSaveError('$msg')", null
                    )
                }
            }
        }
    }

    // ==================== 通知 ====================
    inner class NativeNotify {
        @JavascriptInterface
        fun show(title: String?, body: String?) {
            runOnUiThread {
                val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val ch = NotificationChannel(
                        "daily", "Daily", NotificationManager.IMPORTANCE_DEFAULT
                    )
                    nm.createNotificationChannel(ch)
                }
                val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Notification.Builder(this@MainActivity, "daily")
                } else {
                    @Suppress("DEPRECATION")
                    Notification.Builder(this@MainActivity)
                }
                builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title ?: "")
                    .setContentText(body ?: "")
                    .setAutoCancel(true)
                nm.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), builder.build())
            }
        }

        @JavascriptInterface
        fun startReminderService() {
            // 如需前台服务，可在这里启动
        }
    }

    // ==================== 打开外链 ====================
    inner class NativeOpen {
        @JavascriptInterface
        fun open(url: String?) {
            runOnUiThread {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "无法打开链接", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
