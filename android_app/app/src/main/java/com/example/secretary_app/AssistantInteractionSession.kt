package com.example.secretary_app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.service.voice.VoiceInteractionSession
import android.util.Log
import android.widget.Toast
import com.example.secretary_app.ApiClient // Corrected import
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.*

class AssistantInteractionSession(context: Context)
    : VoiceInteractionSession(context), RecognitionListener, TextToSpeech.OnInitListener {

    private val tag = "AssistantSession_LOGIC"
    private val coroutineScope = CoroutineScope(Dispatchers.Main)

    // ... (rest of the properties)
    private val CONFIRMATION_UTTERANCE_ID = "CONFIRMATION"
    private val RESPONSE_UTTERANCE_ID = "RESPONSE"

    private lateinit var audioManager: AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null

    private lateinit var speechRecognizer: SpeechRecognizer
    private lateinit var textToSpeech: TextToSpeech
    private var latestRecognizedText: String? = null
    private lateinit var apiClient: ApiClient

    private val utteranceProgressListener = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) { /* ... */ }
        override fun onDone(utteranceId: String?) {
            when (utteranceId) {
                CONFIRMATION_UTTERANCE_ID -> {
                    latestRecognizedText?.let { sendTextToBackend(it) }
                }
                RESPONSE_UTTERANCE_ID -> releaseAudioFocusAndFinish()
            }
        }
        override fun onError(utteranceId: String?) { releaseAudioFocusAndFinish() }
    }

    override fun onCreate() {
        super.onCreate()
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        setupAudioFocus()
        
        apiClient = ApiClient.getInstance(context)

        textToSpeech = TextToSpeech(context, this)
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
        speechRecognizer.setRecognitionListener(this)
    }

    private fun setupAudioFocus() {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

        audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(audioAttributes)
            .setAcceptsDelayedFocusGain(false)
            .setOnAudioFocusChangeListener { focusChange ->
                Log.d(tag, "Audio focus changed: $focusChange")
            }
            .build()
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            textToSpeech.setOnUtteranceProgressListener(utteranceProgressListener)
            textToSpeech.setLanguage(Locale.JAPANESE)
            requestAudioFocusAndStart()
        } else {
            Log.e(tag, "TTS Initialization Failed!")
            finish()
        }
    }
    
    private fun requestAudioFocusAndStart() {
        val result = audioManager.requestAudioFocus(audioFocusRequest!!)
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            Log.d(tag, "Audio focus granted")
            playStartupSound {
                 if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    startVoiceRecognition()
                } else {
                    showToast("マイク権限がありません。アプリの設定画面から許可してください。")
                    releaseAudioFocusAndFinish()
                }
            }
        } else {
            Log.e(tag, "Audio focus denied")
            finish()
        }
    }

    private fun playStartupSound(onCompletion: () -> Unit) {
        try {
            val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val player = MediaPlayer.create(context, notificationUri)
            player?.setOnCompletionListener {
                it.release()
                onCompletion()
            }
            player?.start()
        } catch (e: Exception) {
            Log.e(tag, "Error playing startup sound", e)
            onCompletion() // Play sound failed, but continue the flow.
        }
    }

    private fun startVoiceRecognition() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        speechRecognizer.startListening(intent)
    }

    private fun sendTextToBackend(text: String) {
        coroutineScope.launch {
            showToast("考え中...")
            withContext(Dispatchers.IO) {
                apiClient.postChat(text)
            }.onSuccess { response ->
                if (response.message.isNotBlank()) {
                    speakOut(response.message, RESPONSE_UTTERANCE_ID)
                } else {
                    speakOut("すみません、よく分かりませんでした。", RESPONSE_UTTERANCE_ID)
                }
            }.onFailure { exception ->
                Log.e(tag, "Error sending text to backend", exception)
                val errorMessage = if (exception.message == "Not logged in") {
                    "ログインしていません。アプリを開いてログインしてください。"
                } else {
                    "サーバーとの通信に失敗しました。"
                }
                speakOut(errorMessage, RESPONSE_UTTERANCE_ID)
            }
        }
    }

    private fun speakOut(text: String, utteranceId: String) {
        showToast("発声中: $text")
        textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    }

    override fun onReadyForSpeech(params: Bundle?) {
        showToast("話してください...")
    }

    override fun onResults(results: Bundle?) {
        val recognized = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.getOrNull(0)
        if (!recognized.isNullOrBlank()) {
            latestRecognizedText = recognized
            val confirmationMessage = "「$recognized」でございますね。かしこまりました。"
            speakOut(confirmationMessage, CONFIRMATION_UTTERANCE_ID)
        } else {
            speakOut("すみません、聞き取れませんでした。", RESPONSE_UTTERANCE_ID)
        }
    }

    override fun onError(error: Int) {
        val errorMessage = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "音声エラー"
            SpeechRecognizer.ERROR_CLIENT -> "クライアントエラー"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "権限不足です。設定画面からマイクを許可してください。"
            SpeechRecognizer.ERROR_NETWORK -> "ネットワークエラー"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ネットワークタイムアウト"
            SpeechRecognizer.ERROR_NO_MATCH -> "一致なし"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "認識エンジンがビジー"
            SpeechRecognizer.ERROR_SERVER -> "サーバーエラー"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "タイムアウト"
            else -> "不明なエラー ($error)"
        }
        speakOut("エラー: $errorMessage", RESPONSE_UTTERANCE_ID)
    }

    private fun releaseAudioFocusAndFinish() {
        Log.d(tag, "Releasing audio focus and finishing session.")
        audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        audioFocusRequest = null
        finish()
    }
    
    override fun onHide() {
        super.onHide()
        textToSpeech.shutdown()
        speechRecognizer.destroy()
        // Ensure focus is released if the session is hidden unexpectedly.
        releaseAudioFocusAndFinish()
    }

    private fun showToast(message: String) {
        coroutineScope.launch { Toast.makeText(context, message, Toast.LENGTH_SHORT).show() }
    }

    // Unused callbacks
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onPartialResults(partialResults: Bundle?) {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
}
