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
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Ask the system to start the current voice assistant.
        showAssist(null)

        // An invisible activity must finish itself. However, finishing immediately can
        // cause a race condition where the showAssist request is ignored. 
        // We post a delayed finish call to ensure the system has time to process the request.
        Handler(Looper.getMainLooper()).postDelayed({
            finish()
        }, 500) // A 500ms delay is usually safe.
    }
}
