package com.daily.healthlife;

import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
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

    // ★★★ 保存文件：写完后弹窗，只显示文件名 + 一个"打开下载文件夹"按钮 ★★★
    @JavascriptInterface
    public void saveFile(String content, String filename, String mime) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                // Android 10+ 走 MediaStore，系统自动管理路径
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
            } else {
                // Android 9 及以下，直接写公共下载目录
                File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(content.getBytes(StandardCharsets.UTF_8));
                fos.close();
            }

            final String fname = filename;
            act.runOnUiThread(() -> {
                try {
                    new AlertDialog.Builder(act)
                        .setTitle("✓ 文件已保存")
                        .setMessage("文件名：\n" + fname
                                + "\n\n已保存到系统的「下载」文件夹。\n\n"
                                + "查看方式：打开手机自带的「文件管理」APP，\n"
                                + "切换到「分类」或「下载」视图即可找到。\n\n"
                                + "（部分手机在「下载」APP里也能看到）")
                        .setPositiveButton("打开下载文件夹",
                            (d, w) -> openDownloadFolder())
                        .setNegativeButton("知道了", null)
                        .show();
                } catch (Exception ex) {
                    Toast.makeText(act, "已保存：" + fname, Toast.LENGTH_LONG).show();
                }
            });

            act.runOnUiThread(() -> webView.evaluateJavascript(
                    "window.onFileSaved && window.onFileSaved(true," + jsString(filename) + ")", null));
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

    // ★ 打开系统的"下载"文件夹
    @JavascriptInterface
    public void openDownloadFolder() {
        act.runOnUiThread(() -> {
            // 方式 1：直接跳到系统"下载"应用
            try {
                Intent i = new Intent("android.intent.action.VIEW_DOWNLOADS");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                act.startActivity(i);
                return;
            } catch (Exception ignored) {}
            // 方式 2：用 SAF 打开 Download 目录
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(
                    Uri.parse("content://com.android.externalstorage.documents/root/primary"),
                    "vnd.android.document/directory");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                act.startActivity(i);
                return;
            } catch (Exception ignored) {}
            // 方式 3：打开系统文件管理器
            try {
                Intent i = new Intent(Intent.ACTION_MAIN);
                i.addCategory(Intent.CATEGORY_APP_FILES);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                act.startActivity(i);
                return;
            } catch (Exception ignored) {}
            Toast.makeText(act, "请手动打开「文件管理」APP → 分类 → 下载",
                    Toast.LENGTH_LONG).show();
        });
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
