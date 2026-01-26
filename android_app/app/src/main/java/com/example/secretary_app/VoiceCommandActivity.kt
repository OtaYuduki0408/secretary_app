package com.example.secretary_app

import android.app.Activity
import android.os.Bundle
import android.util.Log

/**
 * An invisible Activity that acts as an entry point for the VOICE_COMMAND intent.
 * Its only purpose is to trigger the AssistantInteractionSession and then disappear.
 */
class VoiceCommandActivity : Activity() {

    private val TAG = "VoiceCommandActivity"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate: Activity created.")
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume: Calling showAssist() and finishing.")
        try {
            showAssist(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error calling showAssist", e)
        }
        // For translucent activities, finish() must be called before onResume() completes.
        finish()
    }
}
