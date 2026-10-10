package com.example.dailyhealth

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import java.io.File

class FileBridge(private val act: AppCompatActivity, private val webView: WebView) {

    @JavascriptInterface
    fun saveFile(content: String, filename: String, mime: String): Boolean {
        return try {
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "DailyHealth"
            )
            if (!dir.exists()) dir.mkdirs()
            File(dir, filename).writeText(content, Charsets.UTF_8)
            webView.post {
                webView.evaluateJavascript(
                    "window.__onFileSaved && window.__onFileSaved(${jsQuote(filename)})", null)
            }
            true
        } catch (e: Exception) { false }
    }

    @JavascriptInterface
    fun pickFile(accept: String) {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/csv", "text/comma-separated-values", "text/plain"))
        }
        act.startActivityForResult(Intent.createChooser(i, "选择文件"), 9999)
    }

    private fun jsQuote(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
