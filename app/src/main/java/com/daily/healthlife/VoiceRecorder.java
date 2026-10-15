package com.daily.healthlife;

import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class VoiceRecorder {

    // ═══════════════════════════════════════════════════════════
    //  讯飞语音听写（流式版）凭证
    // ═══════════════════════════════════════════════════════════
    private static final String APPID      = "4c627b59";
    private static final String API_KEY    = "2fbffaacd145309be7c024db99e9c7ef";
    private static final String API_SECRET = "YzI1MDJmYWM0NTliNzNkMjI3NGIyM2Uz";
    // ═══════════════════════════════════════════════════════════

    private static final String HOST        = "iat-api.xfyun.cn";
    private static final String PATH        = "/v2/iat";
    private static final int    SAMPLE_RATE = 16000;

    /** MainActivity 用到这个常量（保留，不要删） */
    public static final int REQ_VOICE = 2001;

    public interface Callback {
        void onResult(String text);
        void onError(String err);
    }

    private final Context ctx;
    private Callback callback;
    private WebSocket webSocket;
    private AudioRecord audioRecord;
    private volatile boolean recording = false;
    private Thread recordThread;
    private final OkHttpClient client;
    private final StringBuilder resultBuilder = new StringBuilder();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private Runnable timeoutRunnable;         // 录音时长到达时触发 stop()
    private Runnable forceDeliverRunnable;    // 发送 status=2 后的兜底交付

    private volatile boolean ended = false;             // stop() 是否已被调用过
    private volatile boolean resultDelivered = false;   // 是否已交付结果

    public VoiceRecorder(Context ctx) {
        this.ctx = ctx;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();
    }

    public void start(int durationSec, Callback cb) {
        // 彻底清理上一轮（不发送 status=2，直接 cancel）
        hardStop();

        this.callback = cb;
        this.resultBuilder.setLength(0);
        this.ended = false;
        this.resultDelivered = false;

        if (ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            if (callback != null) callback.onError("没有录音权限，请在系统设置中开启");
            return;
        }

        try {
            String url = buildAuthUrl();
            Request request = new Request.Builder().url(url).build();

            webSocket = client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket ws, Response response) {
                    Log.d("VoiceRecorder", "WebSocket 已连接");
                    sendFirstFrame(ws);
                    startAudioRecording(ws);

                    final int dur = (durationSec > 0 ? durationSec : 10);
                    if (timeoutRunnable != null) mainHandler.removeCallbacks(timeoutRunnable);
                    timeoutRunnable = () -> stop();
                    mainHandler.postDelayed(timeoutRunnable, dur * 1000L);
                }

                @Override
                public void onMessage(WebSocket ws, String text) {
                    handleMessage(text);
                }

                @Override
                public void onFailure(WebSocket ws, Throwable t, Response response) {
                    Log.e("VoiceRecorder", "WebSocket 失败", t);
                    if (resultDelivered) return;
                    String msg = t.getMessage();
                    if (response != null) msg = "HTTP " + response.code();
                    String partial = resultBuilder.toString().trim();
                    if (partial.length() > 0) {
                        deliverResult();
                    } else {
                        resultDelivered = true;
                        if (callback != null) callback.onError("语音服务连接失败：" + msg);
                        hardStop();
                    }
                }

                @Override
                public void onClosed(WebSocket ws, int code, String reason) {
                    Log.d("VoiceRecorder", "WebSocket 关闭：" + code + " " + reason);
                }
            });
        } catch (Exception e) {
            Log.e("VoiceRecorder", "启动失败", e);
            if (callback != null) callback.onError("初始化失败：" + e.getMessage());
        }
    }

    private void sendFirstFrame(WebSocket ws) {
        try {
            JSONObject common = new JSONObject();
            common.put("app_id", APPID);

            JSONObject business = new JSONObject();
            business.put("language", "zh_cn");
            business.put("domain", "iat");
            business.put("accent", "mandarin");
            business.put("vad_eos", 3000);
            // ★★★ 关键修改：不再设置 dwa=wpgs ★★★
            //   不启用动态修正，服务端返回简单累加结果，
            //   不需要客户端做 rpl 替换，就不会出现"重复/镜像"问题。

            JSONObject data = new JSONObject();
            data.put("status", 0);
            data.put("format", "audio/L16;rate=16000");
            data.put("encoding", "raw");

            JSONObject frame = new JSONObject();
            frame.put("common", common);
            frame.put("business", business);
            frame.put("data", data);

            ws.send(frame.toString());
        } catch (Exception e) {
            Log.e("VoiceRecorder", "sendFirstFrame 出错", e);
        }
    }

    private void startAudioRecording(WebSocket ws) {
        recording = true;
        int minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuf < 4096) minBuf = 4096;

        try {
            audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, minBuf * 4);
        } catch (Exception e) {
            if (callback != null) callback.onError("无法打开麦克风：" + e.getMessage());
            hardStop();
            return;
        }

        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            if (callback != null) callback.onError("麦克风初始化失败");
            hardStop();
            return;
        }

        audioRecord.startRecording();
        final WebSocket socket = ws;

        recordThread = new Thread(() -> {
            byte[] buffer = new byte[1280];
            while (recording) {
                int n;
                try {
                    n = audioRecord.read(buffer, 0, buffer.length);
                } catch (Exception e) { break; }
                if (n > 0 && socket != null) {
                    try {
                        String b64 = Base64.encodeToString(buffer, 0, n, Base64.NO_WRAP);
                        JSONObject data = new JSONObject();
                        data.put("status", 1);
                        data.put("format", "audio/L16;rate=16000");
                        data.put("encoding", "raw");
                        data.put("audio", b64);
                        JSONObject frame = new JSONObject();
                        frame.put("data", data);
                        socket.send(frame.toString());
                    } catch (Exception e) { /* 忽略 */ }
                }
            }
        }, "audio-record-thread");
        recordThread.start();
    }

    private void handleMessage(String text) {
        try {
            JSONObject obj = new JSONObject(text);
            int code = obj.optInt("code", -1);
            if (code != 0) {
                String msg = obj.optString("message", "未知");
                Log.e("VoiceRecorder", "识别错误 code=" + code + " " + msg);
                if (resultDelivered) return;
                String partial = resultBuilder.toString().trim();
                if (partial.length() > 0) {
                    deliverResult();
                } else {
                    resultDelivered = true;
                    if (callback != null) callback.onError("识别错误 code=" + code);
                    hardStop();
                }
                return;
            }

            JSONObject data = obj.optJSONObject("data");
            if (data == null) return;

            JSONObject result = data.optJSONObject("result");
            if (result != null) {
                JSONArray ws = result.optJSONArray("ws");
                if (ws != null) {
                    for (int i = 0; i < ws.length(); i++) {
                        JSONObject w = ws.getJSONObject(i);
                        JSONArray cw = w.optJSONArray("cw");
                        if (cw != null && cw.length() > 0) {
                            // ★ 简单累加，不做 rpl 替换
                            resultBuilder.append(cw.getJSONObject(0).optString("w"));
                        }
                    }
                }
            }

            // status == 2 表示服务端已发送完最终结果
            if (data.optInt("status", 0) == 2) {
                deliverResult();
            }
        } catch (Exception e) {
            Log.e("VoiceRecorder", "解析消息出错", e);
        }
    }

    /** 交付最终结果，只执行一次 */
    private void deliverResult() {
        if (resultDelivered) return;
        resultDelivered = true;
        String finalText = resultBuilder.toString().trim();
        Log.d("VoiceRecorder", "识别完成：" + finalText);
        if (callback != null) callback.onResult(finalText);
        // 主动关闭 WebSocket
        try { if (webSocket != null) webSocket.close(1000, "done"); } catch (Exception ignored) {}
        webSocket = null;
        cleanupAudio();
        if (forceDeliverRunnable != null) {
            mainHandler.removeCallbacks(forceDeliverRunnable);
            forceDeliverRunnable = null;
        }
    }

    /** 用户点击停止 / 到时自动停止 */
    public void stop() {
        if (ended) return;
        ended = true;

        // 清掉自动超时任务
        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }

        // 立即停止录音
        recording = false;
        if (recordThread != null) {
            try { recordThread.interrupt(); } catch (Exception ignored) {}
            recordThread = null;
        }
        cleanupAudio();

        if (webSocket == null) {
            // 从来没有连接成功过，直接交付（可能为空）
            deliverResult();
            return;
        }

        // ★★★ 关键修改：发送 status=2 后不立即 close，等结果 ★★★
        try {
            JSONObject data = new JSONObject();
            data.put("status", 2);
            data.put("format", "audio/L16;rate=16000");
            data.put("encoding", "raw");
            data.put("audio", "");
            JSONObject frame = new JSONObject();
            frame.put("data", data);
            webSocket.send(frame.toString());
        } catch (Exception ignored) {}

        // ★ 保险：3 秒内如果没收到最终结果，也强行交付，防止卡死
        if (forceDeliverRunnable != null) mainHandler.removeCallbacks(forceDeliverRunnable);
        forceDeliverRunnable = () -> {
            if (!resultDelivered) {
                Log.w("VoiceRecorder", "超时未收到最终结果，强制交付");
                deliverResult();
            }
        };
        mainHandler.postDelayed(forceDeliverRunnable, 3000);
    }

    /** 强制清理（不发送 status=2），用于 start 前清场和 destroy */
    private void hardStop() {
        ended = true;
        resultDelivered = true;
        recording = false;

        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
        if (forceDeliverRunnable != null) {
            mainHandler.removeCallbacks(forceDeliverRunnable);
            forceDeliverRunnable = null;
        }

        if (recordThread != null) {
            try { recordThread.interrupt(); } catch (Exception ignored) {}
            recordThread = null;
        }
        cleanupAudio();

        if (webSocket != null) {
            try { webSocket.cancel(); } catch (Exception ignored) {}
            webSocket = null;
        }
    }

    private void cleanupAudio() {
        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) {}
            try { audioRecord.release(); } catch (Exception ignored) {}
            audioRecord = null;
        }
    }

    public void destroy() {
        hardStop();
        try { client.dispatcher().executorService().shutdown(); } catch (Exception ignored) {}
    }

    private String buildAuthUrl() throws Exception {
        SimpleDateFormat sdf = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("GMT"));
        String date = sdf.format(new Date());

        String signatureOrigin = "host: " + HOST + "\n"
                + "date: " + date + "\n"
                + "GET " + PATH + " HTTP/1.1";

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(API_SECRET.getBytes("UTF-8"), "HmacSHA256"));
        byte[] signBytes = mac.doFinal(signatureOrigin.getBytes("UTF-8"));
        String signature = Base64.encodeToString(signBytes, Base64.NO_WRAP);

        String authorizationOrigin = "api_key=\"" + API_KEY
                + "\", algorithm=\"hmac-sha256\""
                + ", headers=\"host date request-line\""
                + ", signature=\"" + signature + "\"";
        String authorization = Base64.encodeToString(
                authorizationOrigin.getBytes("UTF-8"), Base64.NO_WRAP);

        return "wss://" + HOST + PATH
                + "?authorization=" + URLEncoder.encode(authorization, "UTF-8")
                + "&date=" + URLEncoder.encode(date, "UTF-8")
                + "&host=" + URLEncoder.encode(HOST, "UTF-8");
    }
}
