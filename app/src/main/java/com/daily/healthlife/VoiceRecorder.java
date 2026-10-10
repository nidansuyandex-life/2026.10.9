package com.daily.healthlife;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import java.util.ArrayList;
import java.util.Locale;

/**
 * 使用系统自带的 SpeechRecognizer 做语音识别（无需 API Key，绝大多数国产手机可用）。
 * 你也可以换成讯飞 IAT，但需要额外的 SDK 和签名流程。
 */
public class VoiceRecorder {
    public interface Callback {
        void onResult(String text);
        void onError(String err);
    }

    private static final String TAG = "VoiceRecorder";
    private final Context ctx;
    private SpeechRecognizer recognizer;
    private Callback callback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable timeoutRunnable;
    private boolean listening = false;

    public VoiceRecorder(Context ctx) { this.ctx = ctx; }

    public void start(int durationSec, Callback cb) {
        stop();
        this.callback = cb;

        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
            cb.onError("设备不支持语音识别");
            return;
        }

        recognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}

            @Override public void onError(int error) {
                listening = false;
                cb.onError("识别失败 code=" + error);
            }

            @Override public void onResults(Bundle results) {
                listening = false;
                ArrayList<String> list = results.getStringArrayList(
                        SpeechRecognizer.RESULTS_RECOGNITION);
                StringBuilder sb = new StringBuilder();
                if (list != null) {
                    for (String s : list) {
                        if (sb.length() > 0) sb.append(" ");
                        sb.append(s);
                    }
                }
                cb.onResult(sb.toString());
            }

            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });

        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.CHINA.toString());
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, Locale.CHINA.toString());
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L);
        recognizer.startListening(i);
        listening = true;

        if (timeoutRunnable != null) handler.removeCallbacks(timeoutRunnable);
        final int dur = (durationSec > 0 ? durationSec : 10);
        timeoutRunnable = () -> { if (listening) stop(); };
        handler.postDelayed(timeoutRunnable, dur * 1000L);
    }

    public void stop() {
        if (timeoutRunnable != null) {
            handler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
        if (recognizer != null) {
            try { recognizer.stopListening(); } catch (Exception ignored) {}
            final SpeechRecognizer r = recognizer;
            handler.postDelayed(() -> {
                try { r.destroy(); } catch (Exception ignored) {}
            }, 2500);
            recognizer = null;
        }
        listening = false;
    }

    public void destroy() { stop(); }
}
