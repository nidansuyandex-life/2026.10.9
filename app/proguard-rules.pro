# 保留 JS 桥方法（否则 release 版 @JavascriptInterface 会被混淆）
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.example.dailyhealth.** { *; }

# 讯飞 SparkChain（若使用）
-keep class com.iflytek.sparkchain.** { *; }
-keep class com.iflytek.cloud.** { *; }
-dontwarn com.iflytek.**
