package com.example.dailyhealth

import android.Manifest
import android.content.pm.PackageManager
import android.os.*
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1) 请求运行时权限（麦克风 + 通知）
        val need = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) need += Manifest.permission.RECORD_AUDIO
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isNotEmpty())
            ActivityCompat.requestPermissions(this, need.toTypedArray(), 100)

        // 2) 初始化讯飞 SparkChain（如不需要可注释）
        VoiceBridge.init(this)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // 关键：允许 file:// 页面读取同目录/子目录资源
            if (Build.VERSION.SDK_INT >= 16) {
                @Suppress("DEPRECATION")
                allowFileAccessFromFileURLs = true
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = true
            }
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = WebViewClient()

        // 3) 注入原生桥
        webView.addJavascriptInterface(NativeBridge(this, webView), "AndroidNative")
        webView.addJavascriptInterface(VoiceBridge(this, webView), "AndroidVoice")
        webView.addJavascriptInterface(FileBridge(this, webView), "AndroidFile")
        // 兼容旧代码里的 AndroidTTS 名字（转发到 NativeBridge）
        webView.addJavascriptInterface(TTSCompat(this), "AndroidTTS")

        webView.loadUrl("file:///android_asset/index.html")
    }

    /** 兼容旧 HTML 里的 AndroidTTS.speak / stop 调用 */
    inner class TTSCompat(private val act: MainActivity) {
        @JavascriptInterface fun speak(text: String, lang: String) =
            NativeBridge(act, webView).speak(text, lang)
        @JavascriptInterface fun stop() = NativeBridge(act, webView).stopSpeak()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        VoiceBridge.release()
        super.onDestroy()
    }
}
