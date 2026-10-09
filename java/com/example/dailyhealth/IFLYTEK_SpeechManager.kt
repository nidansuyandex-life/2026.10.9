package com.example.dailyhealth

import android.content.Context
import android.util.Log
import com.iflytek.sparkchain.core.SparkChain
import com.iflytek.sparkchain.core.SparkChainConfig
import com.iflytek.sparkchain.core.asr.ASR
import com.iflytek.sparkchain.core.asr.ASRCallbacks
import com.iflytek.sparkchain.core.asr.ASRResult

class IFLYTEK_SpeechManager(private val context: Context, private val appId: String) {

    private var asr: ASR? = null
    private var resultCallback: ((String) -> Unit)? = null

    init {
        // 初始化讯飞 SparkChain SDK
        val config = SparkChainConfig.builder()
            .appID(appId)
            .logLevel(Log.DEBUG)
            .build()
        val ret = SparkChain.getInst().init(context, config)
        if (ret != 0) {
            Log.e("IFLYTEK", "讯飞SDK初始化失败，错误码: $ret")
        }
    }

    fun startListening(onResult: (String) -> Unit) {
        this.resultCallback = onResult
        
        // 构建 ASR 参数
        val asrConfig = ASR.Config()
            .language("zh_cn")
            .domain("iat")
            .accent("mandarin")
            .vadBos(5000) // 静音检测时间
            .vadEos(5000)

        asr = ASR(asrConfig)
        
        // 设置回调
        asr?.setCallbacks(object : ASRCallbacks {
            override fun onResult(result: ASRResult?, isLast: Boolean) {
                if (result != null && result.text != null) {
                    resultCallback?.invoke(result.text)
                }
            }

            override fun onError(errorCode: Int, errorMsg: String?) {
                Log.e("IFLYTEK", "识别错误: $errorCode, $errorMsg")
            }
        })
        
        // 启动识别
        asr?.start()
    }

    fun stopListening() {
        asr?.stop()
        asr = null
    }

    fun release() {
        asr?.stop()
        asr = null
        SparkChain.getInst().unInit()
    }
}
