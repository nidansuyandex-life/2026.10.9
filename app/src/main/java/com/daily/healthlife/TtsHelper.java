package com.daily.healthlife;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import java.util.LinkedList;
import java.util.Locale;
import java.util.Queue;

public class TtsHelper implements TextToSpeech.OnInitListener {
    private static final String TAG = "TtsHelper";
    private TextToSpeech tts;
    private boolean ready = false;

    private static class Pending {
        String text, lang;
        Pending(String t, String l) { text = t; lang = l; }
    }
    private final Queue<Pending> queue = new LinkedList<>();

    public TtsHelper(Context ctx) {
        tts = new TextToSpeech(ctx.getApplicationContext(), this);
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            ready = true;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) {}
                @Override public void onError(String utteranceId) {}
            });
            synchronized (queue) {
                while (!queue.isEmpty()) {
                    Pending p = queue.poll();
                    doSpeak(p.text, p.lang);
                }
            }
            Log.d(TAG, "TTS ready");
        } else {
            Log.e(TAG, "TTS init failed: " + status);
        }
    }

    public void speak(String text, String lang) {
        if (text == null || text.trim().isEmpty()) return;
        if (!ready) {
            synchronized (queue) { queue.add(new Pending(text, lang)); }
            return;
        }
        doSpeak(text, lang);
    }

    private void doSpeak(String text, String lang) {
        try {
            Locale loc = (lang != null && lang.toLowerCase().startsWith("zh"))
                    ? Locale.CHINA : Locale.US;
            int avail = tts.isLanguageAvailable(loc);
            if (avail == TextToSpeech.LANG_MISSING_DATA
                    || avail == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.getDefault());
            } else {
                tts.setLanguage(loc);
            }
            tts.setSpeechRate(0.95f);
            tts.setPitch(1.0f);
            String id = "u" + System.currentTimeMillis();
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
        } catch (Exception e) {
            Log.e(TAG, "speak err", e);
        }
    }

    public void stop() {
        try { if (tts != null) tts.stop(); } catch (Exception ignored) {}
    }

    public void destroy() {
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception ignored) {}
    }
}
