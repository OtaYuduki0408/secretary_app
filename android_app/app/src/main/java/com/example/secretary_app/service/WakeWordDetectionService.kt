package com.example.secretary_app.service

import android.Manifest
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.IBinder
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import com.example.secretary_app.MainActivity
import com.example.secretary_app.data.sync.SyncSettingsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class WakeWordDetectionService : Service(), RecognitionListener {

    private val TAG = "WakeWordDetectionService"
    private lateinit var speechRecognizer: SpeechRecognizer
    private lateinit var settingsRepository: SyncSettingsRepository
    private var wakeWords: List<String> = emptyList()

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "onCreate: Service creating.")
        settingsRepository = SyncSettingsRepository(this)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
            speechRecognizer.setRecognitionListener(this)
        } else {
            Log.e(TAG, "RECORD_AUDIO permission not granted. Cannot create SpeechRecognizer.")
            stopSelf() // Stop the service if permission is not granted.
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: Service started.")
        if (!::speechRecognizer.isInitialized) {
            Log.e(TAG, "SpeechRecognizer not initialized. Stopping service.")
            return START_NOT_STICKY
        }
        CoroutineScope(Dispatchers.IO).launch {
            wakeWords = settingsRepository.settingsFlow.first().wakeWords.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            Log.d(TAG, "Loaded wake words: $wakeWords")
            startListening()
        }
        return START_STICKY // Service will be restarted if it's killed
    }

    private fun startListening() {
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            }
            speechRecognizer.startListening(intent)
            Log.d(TAG, "startListening: Speech recognizer started.")
        } else {
            Log.e(TAG, "Speech recognition not available.")
            stopSelf()
        }
    }

    override fun onResults(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        if (!matches.isNullOrEmpty()) {
            Log.d(TAG, "onResults: ${matches[0]}")
            if (wakeWords.any { matches[0].contains(it, ignoreCase = true) }) {
                Log.i(TAG, "Wake word detected!")
                // Wake word detected, launch the voice interaction
                val intent = Intent(this, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    putExtra("start_voice_interaction", true)
                }
                startActivity(intent)
            }
        }
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        if (!matches.isNullOrEmpty()) {
            if (wakeWords.any { matches[0].contains(it, ignoreCase = true) }) {
                Log.i(TAG, "Wake word detected in partial results!")
                speechRecognizer.stopListening() // Stop listening to process this
            }
        }
    }

    override fun onError(error: Int) {
        Log.e(TAG, "onError: $error")
        // Restart listening after a short delay
        startListening()
    }

    override fun onEndOfSpeech() {
        Log.d(TAG, "onEndOfSpeech: Restarting listener.")
        startListening()
    }

    override fun onDestroy() {
        super.onDestroy()
        if(::speechRecognizer.isInitialized) {
            speechRecognizer.destroy()
        }
        Log.d(TAG, "onDestroy: Service destroyed.")
    }

    // Unused RecognitionListener methods
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEvent(eventType: Int, params: Bundle?) {}

    override fun onBind(intent: Intent?): IBinder? = null
}
