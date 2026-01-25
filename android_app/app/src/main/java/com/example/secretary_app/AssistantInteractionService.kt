package com.example.secretary_app

import android.service.voice.VoiceInteractionService

/**
 * The main entry point for the system to bind to when this app is selected as the
 * default voice assistant. This service just needs to exist and be declared in the manifest.
 * The actual work is done by the session service and session classes.
 */
class AssistantInteractionService : VoiceInteractionService()
