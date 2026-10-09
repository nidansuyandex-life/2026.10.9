package com.example.dailyhealth

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST_CODE = 1001
    private var tts: TextToSpeech? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 一次性申请所有权限
        val needPerms = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needPerms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val toRequest = needPerms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (toRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, toRequest.toTypedArray(), 100)
        }

        // ★ 关键 1：初始化原生 TTS
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) Log.d("TTS", "TTS 初始化成功")
            else Log.e("TTS", "TTS 初始化失败: $status")
        }

        // ★ 关键 2：WebViewAssetLoader（让页面走 https，麦克风/WebCrypto 才能用）
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // ★ 关键 3：注入 AndroidTTS 和 AndroidFile 桥接
        webView.addJavascriptInterface(TTSBridge(), "AndroidTTS")
        webView.addJavascriptInterface(FileBridge(), "AndroidFile")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }

            // ★ 关键 4：文件选择器
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                val intent: Intent? = fileChooserParams?.createIntent()
                if (intent == null) {
                    this@MainActivity.filePathCallback = null
                    return false
                }
                return try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                    true
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        // ★ 关键 5：从 https 域名加载
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    inner class TTSBridge {
        @JavascriptInterface
        fun speak(text: String, lang: String) {
            if (text.isBlank()) return
            tts?.let { t ->
                val locale = if (lang.startsWith("zh")) Locale.SIMPLIFIED_CHINESE else Locale.US
                val result = t.setLanguage(locale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.e("TTS", "语言不支持: $lang")
                    return
                }
                t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tts-${System.currentTimeMillis()}")
            }
        }

        @JavascriptInterface
        fun stop() { tts?.stop() }
    }

    inner class FileBridge {
        @JavascriptInterface
        fun saveFile(content: String, fileName: String, mimeType: String) {
            try {
                val dir = getExternalFilesDir(null)
                val file = java.io.File(dir, fileName)
                file.writeText(content)
                Log.d("FileBridge", "已保存: ${file.absolutePath}")
            } catch (e: Exception) {
                Log.e("FileBridge", "保存失败", e)
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val cb = filePathCallback ?: return
            val results = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            cb.onReceiveValue(results)
            filePathCallback = null
        }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
