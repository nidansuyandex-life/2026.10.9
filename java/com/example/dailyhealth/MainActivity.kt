package com.example.dailyhealth

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.os.Environment
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var speechManager: IFLYTEK_SpeechManager

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 初始化讯飞语音管理器 (填入你的 APPID)
        speechManager = IFLYTEK_SpeechManager(this, "你的讯飞APPID")
        
        webView = WebView(this)
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        // 绑定原生接口到 JS
        webView.addJavascriptInterface(AndroidSpeechBridge(), "AndroidSpeech")
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = WebViewClient()
        
        // 加载 assets 目录下的 index.html
        webView.loadUrl("file:///android_asset/index.html")
    }

    // 桥接 1：语音识别 (对应 index.html 中的 window.AndroidSpeech)
    inner class AndroidSpeechBridge {
        @JavascriptInterface
        fun start() {
            runOnUiThread {
                speechManager.startListening { result ->
                    // 将识别结果回调给 JS
                    val js = "window.onNativeSpeechResult('${result.replace("'", "\\'")}')"
                    webView.evaluateJavascript(js, null)
                }
            }
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread {
                speechManager.stopListening()
            }
        }
    }

    // 桥接 2：文件保存 (对应 index.html 中的 AndroidBridge.saveFile)
    inner class AndroidBridge {
        @JavascriptInterface
        fun saveFile(content: String, fileName: String, mimeType: String) {
            try {
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val file = File(downloadsDir, fileName)
                val outputStream = FileOutputStream(file)
                outputStream.write(content.toByteArray())
                outputStream.close()
                
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "文件已保存至下载目录: $fileName", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onDestroy() {
        speechManager.release()
        super.onDestroy()
    }
}
