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

    // 讯飞语音听写（流式版）
    private static final String APPID      = "4c627b59";
    private static final String API_KEY    = "2fbffaacd145309be7c024db99e9c7ef";
    private static final String API_SECRET = "YzI1MDJmYWM0NTliNzNkMjI3NGIyM2Uz";

    private static final String HOST        = "iat-api.xfyun.cn";
    private static final String PATH        = "/v2/iat";
    private static final int    SAMPLE_RATE = 16000;

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

    private Runnable timeoutRunnable;
    private Runnable forceDeliverRunnable;

    private volatile boolean ended = false;
    private volatile boolean resultDelivered = false;

    public VoiceRecorder(Context ctx) {
        this.ctx = ctx;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();
    }

    public void start(int durationSec, Callback cb) {
        hardStop();
        this.callback = cb;
        this.resultBuilder.setLength(0);
        this.ended = false;
        this.resultDelivered = false;

        if (ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            if (callback != null) callback.onError("没有录音权限");
            return;
        }

        try {
            String url = buildAuthUrl();
            Request request = new Request.Builder().url(url).build();

            webSocket = client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket ws, Response response) {
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
                    if (resultDelivered) return;
                    String msg = t.getMessage();
                    if (response != null) msg = "HTTP " + response.code();
                    String partial = resultBuilder.toString().trim();
                    if (partial.length() > 0){
                        deliverResult();
                    } else {
                        resultDelivered = true;
                        if (callback != null) callback.onError("连接失败：" + msg);
                        hardStop();
                    }
                }

                @Override
                public void onClosed(WebSocket ws, int code, String reason) {}
            });
        } catch (Exception e) {
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
            // ★ 不设置 dwa —— 关闭动态修正，避免重复/镜像

            JSONObject data = new JSONObject();
            data.put("status", 0);
            data.put("format", "audio/L16;rate=16000");
            data.put("encoding", "raw");

            JSONObject frame = new JSONObject();
            frame.put("common", common);
            frame.put("business", business);
            frame.put("data", data);
            ws.send(frame.toString());
        } catch (Exception e) { Log.e("VoiceRecorder", "sendFirstFrame", e); }
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
            if (callback != null) callback.onError("无法打开麦克风");
            hardStop(); return;
        }

        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            if (callback != null) callback.onError("麦克风初始化失败");
            hardStop(); return;
        }

        audioRecord.startRecording();
        final WebSocket socket = ws;

        recordThread = new Thread(() -> {
            byte[] buffer = new byte[1280];
            while (recording) {
                int n;
                try { n = audioRecord.read(buffer, 0, buffer.length); }
                catch (Exception e) { break; }
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
                    } catch (Exception e) {}
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
                if (resultDelivered) return;
                String partial = resultBuilder.toString().trim();
                if (partial.length() > 0) deliverResult();
                else {
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
                            resultBuilder.append(cw.getJSONObject(0).optString("w"));
                        }
                    }
                }
            }

            if (data.optInt("status", 0) == 2) {
                deliverResult();
            }
        } catch (Exception e) { Log.e("VoiceRecorder", "handleMessage", e); }
    }

    private void deliverResult() {
        if (resultDelivered) return;
        resultDelivered = true;
        String finalText = resultBuilder.toString().trim();
        if (callback != null) callback.onResult(finalText);
        try { if (webSocket != null) webSocket.close(1000, "done"); } catch (Exception ignored) {}
        webSocket = null;
        cleanupAudio();
        if (forceDeliverRunnable != null) {
            mainHandler.removeCallbacks(forceDeliverRunnable);
            forceDeliverRunnable = null;
        }
    }

    public void stop() {
        if (ended) return;
        ended = true;
        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
        recording = false;
        if (recordThread != null) {
            try { recordThread.interrupt(); } catch (Exception ignored) {}
            recordThread = null;
        }
        cleanupAudio();

        if (webSocket == null) { deliverResult(); return; }

        // ★ status=2 后不立即 close，等最终结果
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

        // 3 秒兜底
        if (forceDeliverRunnable != null) mainHandler.removeCallbacks(forceDeliverRunnable);
        forceDeliverRunnable = () -> { if (!resultDelivered) deliverResult(); };
        mainHandler.postDelayed(forceDeliverRunnable, 3000);
    }

    private void hardStop() {
        ended = true;
        resultDelivered = true;
        recording = false;
        if (timeoutRunnable != null) { mainHandler.removeCallbacks(timeoutRunnable); timeoutRunnable = null; }
        if (forceDeliverRunnable != null) { mainHandler.removeCallbacks(forceDeliverRunnable); forceDeliverRunnable = null; }
        if (recordThread != null) { try { recordThread.interrupt(); } catch (Exception ignored) {} recordThread = null; }
        cleanupAudio();
        if (webSocket != null) { try { webSocket.cancel(); } catch (Exception ignored) {} webSocket = null; }
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
        String signatureOrigin = "host: " + HOST + "\n" + "date: " + date + "\n" +
                                 "GET " + PATH + " HTTP/1.1";
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
