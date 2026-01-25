package com.example.secretary_app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.google.accompanist.web.WebView
import com.google.accompanist.web.rememberWebViewState

class ResultActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // For now, we just load the main web app. 
        // We can enhance this to show specific results based on intent extras.
        val url = intent.getStringExtra("url") ?: "http://10.0.2.2:5000/"

        setContent {
            val webViewState = rememberWebViewState(url = url)
            WebView(
                state = webViewState,
                onCreated = {
                    it.settings.javaScriptEnabled = true
                }
            )
        }
    }
}