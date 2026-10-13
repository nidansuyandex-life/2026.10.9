package com.daily.healthlife;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.util.Log;

import java.util.ArrayList;

/**
 * 语音识别：调用系统语音输入界面（RecognizerIntent）
 * 不依赖任何第三方 API，不需要 key，几乎所有 Android 设备都支持
 */
public class VoiceRecorder {
    public static final int REQ_VOICE = 2001;

    public interface Callback {
        void onResult(String text);
        void onError(String err);
    }

    private final Context ctx;
    private Callback callback;

    public VoiceRecorder(Context ctx) { this.ctx = ctx; }

    public void start(int durationSec, Callback cb) {
        this.callback = cb;
        if (!(ctx instanceof Activity)) {
            if (cb != null) cb.onError("不是 Activity 环境");
            return;
        }
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "zh-CN");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "请说出消费内容，例如：早餐17块3毛5");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L);
            ((Activity) ctx).startActivityForResult(intent, REQ_VOICE);
        } catch (Exception e) {
            Log.e("VoiceRecorder", "启动失败", e);
            if (cb != null) cb.onError("无法启动系统语音输入：" + e.getMessage());
        }
    }

    /** 由 MainActivity 在 onActivityResult 里转发 */
    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_VOICE) return;
        Callback cb = callback;
        callback = null;
        if (cb == null) return;
        if (resultCode != Activity.RESULT_OK || data == null) {
            cb.onError("已取消");
            return;
        }
        ArrayList<String> results = data.getStringArrayListExtra(
                RecognizerIntent.EXTRA_RESULTS);
        if (results != null && results.size() > 0) {
            cb.onResult(results.get(0));
        } else {
            cb.onError("没有识别到内容");
        }
    }

    public void stop() { /* 系统 Activity 无法主动停止 */ }

    public void destroy() { stop(); }
}
