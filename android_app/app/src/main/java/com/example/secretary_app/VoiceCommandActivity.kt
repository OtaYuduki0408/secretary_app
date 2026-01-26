package com.example.secretary_app

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/**
 * An invisible Activity that acts as an entry point for the VOICE_COMMAND intent.
 * Its only purpose is to trigger the AssistantInteractionSession and then disappear.
 */
class VoiceCommandActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private var isSessionStarted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // In onCreate, we only initiate the process.
        if (intent.action == "android.intent.action.ASSIST") {
            // If started as an assistant, let the system handle it.
        } else {
            // If started by our app, explicitly request the assistant.
            showAssist(null)
        }
    }

    override fun onResume() {
        super.onResume()
        // The session should start shortly after onResume. We post a delayed finish
        // to ensure the activity doesn't linger.
        handler.postDelayed({
            if (!isFinishing) {
                finish()
            }
        }, 500) // Finish after 500ms regardless of session start.
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        // Handle new intents if the activity is reused.
    }

    // This is a placeholder for a callback from the VoiceInteractionSession
    // to signal that it has started.
    fun onSessionStarted() {
        isSessionStarted = true
        // Now that the session is started, we can safely finish the activity.
        handler.post {
            if (!isFinishing) {
                finish()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        // Clean up the delayed finish handler to prevent it from running if the activity
        // is paused for other reasons.
        handler.removeCallbacksAndMessages(null)
        if (!isFinishing) {
            finish() // Ensure the activity is finished when it is paused.
        }
    }
}
