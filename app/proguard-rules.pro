# 未开启 minify，此文件可留空

# 如果以后开启，保留 JS 接口
-keepclassmembers class com.example.dailyhealth.NativeBridge {
    public *;
}
-keepclassmembers class com.example.dailyhealth.VoiceBridge {
    public *;
}
-keepclassmembers class com.example.dailyhealth.FileBridge {
    public *;
}
-keep class com.iflytek.sparkchain.** { *; }
-keep class com.iflytek.cloud.** { *; }
