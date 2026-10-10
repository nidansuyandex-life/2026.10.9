package com.example.dailyhealth

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.*
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import java.util.*

/**
 * 语音识别桥。
 *
 * 默认使用 Android 原生 SpeechRecognizer（无需 API Key）。
 * 若要换成讯飞 SparkChain：把 init() 里的注释解开，
 * 用 IAT.start() 替换 startListen() 内部逻辑即可。
 * （讯飞 SparkChain 的 IAT 接口：
 *   val iat = IAT(); iat.setParams(...); iat.start(listener) )
 */
class VoiceBridge(private val ctx: Context, private val webView: WebView) {

    companion object {
        private var inited = false

        fun init(context: Context) {
            if (inited) return
            inited = true
            // ── 讯飞 SparkChain 初始化（若你有 appID/apiKey/apiSecret）──
            // val cfg = SparkChainConfig.builder()
            //     .appID("你的APPID").apiKey("你的APIKEY").apiSecret("你的SECRET")
            //     .build()
            // SparkChain.getInst().init(context, cfg)
        }

        fun release() { /* SparkChain.getInst().unInit() */ }
    }

    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var timeoutHandler: Handler? = null
    private var timeoutRunnable: Runnable? = null

    @JavascriptInterface
    fun isListening(): Boolean = listening

    /** 开始录音识别，最长 10s 自动停止 */
    @JavascriptInterface
    fun start() {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            webView.post { webView.evaluateJavascript(
                "window.onVoiceError && window.onVoiceError('没有麦克风权限')", null) }
            return
        }
        Handler(Looper.getMainLooper()).post {
            stopInternal(silent = true)

            if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
                webView.post { webView.evaluateJavascript(
                    "window.onVoiceError && window.onVoiceError('设备不支持语音识别')", null) }
                return@post
            }

            recognizer = SpeechRecognizer.createSpeechRecognizer(ctx)
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }

            recognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(p: Bundle?) {
                    listening = true
                    webView.post { webView.evaluateJavascript(
                        "window.onVoiceStart && window.onVoiceStart()", null) }
                }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rms: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) {
                    listening = false
                    cancelTimeout()
                    webView.post { webView.evaluateJavascript(
                        "window.onVoiceError && window.onVoiceError('识别失败($error)')", null) }
                }
                override fun onResults(results: Bundle?) {
                    listening = false
                    cancelTimeout()
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    webView.post { webView.evaluateJavascript(
                        "window.onVoiceResult && window.onVoiceResult(${jsQuote(text)})", null) }
                }
                override fun onPartialResults(partial: Bundle?) {
                    val text = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    if (text.isNotEmpty()) {
                        webView.post { webView.evaluateJavascript(
                            "window.onVoicePartial && window.onVoicePartial(${jsQuote(text)})", null) }
                    }
                }
                override fun onEvent(e: Int, p: Bundle?) {}
            })

            recognizer?.startListening(intent)

            // 10 秒自动停止
            timeoutHandler = Handler(Looper.getMainLooper())
            timeoutRunnable = Runnable { stopInternal(silent = false) }
            timeoutHandler?.postDelayed(timeoutRunnable!!, 10_000L)
        }
    }

    @JavascriptInterface
    fun stop() { Handler(Looper.getMainLooper()).post { stopInternal(silent = false) } }

    private fun stopInternal(silent: Boolean) {
        cancelTimeout()
        try { recognizer?.stopListening() } catch (_: Throwable) {}
        try { recognizer?.cancel() } catch (_: Throwable) {}
        try { recognizer?.destroy() } catch (_: Throwable) {}
        recognizer = null
        if (listening) {
            listening = false
            if (!silent) webView.post { webView.evaluateJavascript(
                "window.onVoiceStop && window.onVoiceStop()", null) }
        }
    }

    private fun cancelTimeout() {
        timeoutRunnable?.let { timeoutHandler?.removeCallbacks(it) }
        timeoutRunnable = null
    }

    private fun jsQuote(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\n", "\\n").replace("\r", "") + "\""
}
