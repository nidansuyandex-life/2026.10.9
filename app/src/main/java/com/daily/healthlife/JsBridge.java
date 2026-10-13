package com.daily.healthlife;

import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class JsBridge {
    private final MainActivity act;
    private final WebView webView;
    private final TtsHelper tts;
    private final VoiceRecorder recorder;

    public JsBridge(MainActivity a, WebView w) {
        this.act = a;
        this.webView = w;
        this.tts = new TtsHelper(a);
        this.recorder = new VoiceRecorder(a);
    }

    @JavascriptInterface
    public void speak(String text, String lang) { tts.speak(text, lang); }

    @JavascriptInterface
    public void stopSpeak() { tts.stop(); }

    @JavascriptInterface
    public void startRecognize(int durationSec) {
        act.runOnUiThread(() -> recorder.start(durationSec, new VoiceRecorder.Callback() {
            @Override public void onResult(String text) {
                final String s = text == null ? "" : text;
                act.runOnUiThread(() -> webView.evaluateJavascript(
                        "window.onVoiceResult && window.onVoiceResult(" + jsString(s) + ")", null));
            }
            @Override public void onError(String err) {
                act.runOnUiThread(() -> webView.evaluateJavascript(
                        "window.onVoiceError && window.onVoiceError(" + jsString(err) + ")", null));
            }
        }));
    }

    @JavascriptInterface
    public void stopRecognize() { recorder.stop(); }

    public VoiceRecorder getVoiceRecorder() { return recorder; }

    private static String jsString(String s) {
        if (s == null) return "''";
        StringBuilder sb = new StringBuilder("'");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '\'': sb.append("\\'"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                default: sb.append(c);
            }
        }
        return sb.append("'").toString();
    }

    // ★ 改动：保存后弹窗显示完整路径
    @JavascriptInterface
    public void saveFile(String content, String filename, String mime) {
        try {
            final String displayPath;
            if (Build.VERSION.SDK_INT >= 29) {
                // Android 10+ 走 MediaStore，落到「下载/Download」目录
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                cv.put(MediaStore.Downloads.MIME_TYPE,
                        mime == null ? "application/octet-stream" : mime);
                Uri uri = act.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new Exception("无法创建文件");
                OutputStream os = act.getContentResolver().openOutputStream(uri);
                if (os == null) throw new Exception("无法打开输出流");
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.close();
                // 常见设备上的真实路径
                displayPath = Environment.getExternalStorageDirectory().getAbsolutePath()
                        + "/Download/" + filename;
            } else {
                // Android 9 及以下，直接写到公共下载目录
                File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(content.getBytes(StandardCharsets.UTF_8));
                fos.close();
                displayPath = f.getAbsolutePath();
            }

            final String fname = filename;
            final String fpath = displayPath;

            act.runOnUiThread(() -> {
                try {
                    new AlertDialog.Builder(act)
                        .setTitle("✓ 文件已保存")
                        .setMessage("文件名：\n" + fname
                                + "\n\n保存位置（打开手机「文件管理」→「下载」）：\n" + fpath)
                        .setPositiveButton("知道了", null)
                        .show();
                } catch (Exception ex) {
                    Toast.makeText(act, "已保存：" + fpath, Toast.LENGTH_LONG).show();
                }
            });

            act.runOnUiThread(() -> webView.evaluateJavascript(
                    "window.onFileSaved && window.onFileSaved(true," + jsString(fpath) + ")", null));
        } catch (Exception e) {
            Log.e("saveFile", "err", e);
            final String msg = e.getMessage();
            act.runOnUiThread(() -> {
                Toast.makeText(act, "保存失败：" + msg, Toast.LENGTH_LONG).show();
                webView.evaluateJavascript(
                        "window.onFileSaved && window.onFileSaved(false," + jsString(msg) + ")", null);
            });
        }
    }

    @JavascriptInterface
    public void notify(String title, String body) {
        try {
            NotificationManager nm = (NotificationManager)
                    act.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(
                        "healthlife", "健康生活提醒", NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
            }
            NotificationCompat.Builder b = new NotificationCompat.Builder(act, "healthlife")
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true);
            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (Exception e) {
            Log.e("notify", "err", e);
        }
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        try {
            Vibrator v = (Vibrator) act.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(ms);
            }
        } catch (Exception ignored) {}
    }

    public void destroy() {
        tts.destroy();
        recorder.destroy();
    }
}
