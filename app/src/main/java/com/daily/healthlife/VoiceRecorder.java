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

/**
 * 语音识别：使用讯飞 WebSocket IAT 实时识别
 * 完全不依赖系统 SpeechRecognizer，几乎所有手机都能用
 */
public class VoiceRecorder {

    // 讯飞配置（与 HTML 里的 XUNFEI_CONFIG 保持一致）
    private static final String APPID      = "4c627b59";
    private static final String API_SECRET = "YzI1MDJmYWM0NTliNzNkMjl3NGIyM2Uz";
    private static final String API_KEY    = "2fbffaacd145309be7c024db99e9c7ef";
    private static final String HOST       = "iat-api.xfyun.cn";
    private static final String PATH       = "/v2/iat";
    private static final int    SAMPLE_RATE = 16000;

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
    private OkHttpClient client;
    private final StringBuilder resultBuilder = new StringBuilder();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable timeoutRunnable;

    public VoiceRecorder(Context ctx) {
        this.ctx = ctx;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();
    }

    public void start(int durationSec, Callback cb) {
        stop();
        this.callback = cb;
        this.resultBuilder.setLength(0);

        // 检查录音权限
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

                    // 到时间自动停止
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
                    if (callback != null) callback.onError("网络错误：" + t.getMessage());
                    stop();
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

    /** 发送第一帧（参数配置） */
    private void sendFirstFrame(WebSocket ws) {
        try {
            JSONObject common = new JSONObject();
            common.put("app_id", APPID);

            JSONObject business = new JSONObject();
            business.put("language", "zh_cn");
            business.put("domain", "iat");
            business.put("accent", "mandarin");
            business.put("vad_eos", 3000);
            business.put("dwa", "wpgs");   // 开启动态修正

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

    /** 开始录音并实时发送 PCM 数据 */
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
            stop();
            return;
        }

        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            if (callback != null) callback.onError("麦克风初始化失败");
            stop();
            return;
        }

        audioRecord.startRecording();
        final WebSocket socket = ws;

        recordThread = new Thread(() -> {
            // 40ms 一帧 = 16000 * 0.04 * 2 bytes = 1280 bytes
            byte[] buffer = new byte[1280];
            while (recording) {
                int n;
                try {
                    n = audioRecord.read(buffer, 0, buffer.length);
                } catch (Exception e) {
                    break;
                }
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
                    } catch (Exception e) {
                        Log.e("VoiceRecorder", "发送音频出错", e);
                    }
                }
            }
        }, "audio-record-thread");
        recordThread.start();
    }

    /** 处理识别结果 */
    private void handleMessage(String text) {
        try {
            JSONObject obj = new JSONObject(text);
            int code = obj.optInt("code", -1);
            if (code != 0) {
                String msg = obj.optString("message", "未知");
                if (callback != null) callback.onError("识别错误 code=" + code + " " + msg);
                stop();
                return;
            }

            JSONObject data = obj.optJSONObject("data");
            if (data == null) return;

            JSONObject result = data.optJSONObject("result");
            if (result != null) {
                JSONArray ws = result.optJSONArray("ws");
                StringBuilder piece = new StringBuilder();
                if (ws != null) {
                    for (int i = 0; i < ws.length(); i++) {
                        JSONObject w = ws.getJSONObject(i);
                        JSONArray cw = w.optJSONArray("cw");
                        if (cw != null && cw.length() > 0) {
                            piece.append(cw.getJSONObject(0).optString("w"));
                        }
                    }
                }

                String pgs = result.optString("pgs", "apd");
                if ("rpl".equals(pgs)) {
                    JSONArray rg = result.optJSONArray("rg");
                    if (rg != null && rg.length() == 2) {
                        int start = rg.optInt(0);
                        int end = rg.optInt(1);
                        if (start >= 0 && end <= resultBuilder.length() && start <= end) {
                            resultBuilder.replace(start, end, piece.toString());
                        }
                    }
                } else {
                    resultBuilder.append(piece);
                }
            }

            // status == 2 表示识别结束
            if (data.optInt("status", 0) == 2) {
                String finalText = resultBuilder.toString().trim();
                if (callback != null) callback.onResult(finalText);
                stop();
            }
        } catch (Exception e) {
            Log.e("VoiceRecorder", "解析消息出错", e);
        }
    }

    /** 停止录音 + 关闭 WebSocket */
    public void stop() {
        recording = false;

        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }

        if (recordThread != null) {
            try { recordThread.interrupt(); } catch (Exception ignored) {}
            recordThread = null;
        }

        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) {}
            try { audioRecord.release(); } catch (Exception ignored) {}
            audioRecord = null;
        }

        if (webSocket != null) {
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
            try { webSocket.close(1000, "done"); } catch (Exception ignored) {}
            webSocket = null;
        }
    }

    public void destroy() {
        stop();
        try { client.dispatcher().executorService().shutdown(); } catch (Exception ignored) {}
    }

    /** 生成讯飞 WebSocket 鉴权 URL */
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
