package com.example.secretary_app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.google.accompanist.web.WebView
import com.google.accompanist.web.rememberWebViewState

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            val webViewState = rememberWebViewState(url = "file:///android_asset/main.html")
            WebView(
                state = webViewState,
                onCreated = {
                    it.settings.javaScriptEnabled = true
                    it.settings.domStorageEnabled = true
                    it.settings.allowFileAccess = true
                    it.settings.allowContentAccess = true
                    it.settings.allowFileAccessFromFileURLs = true
                    it.settings.allowUniversalAccessFromFileURLs = true
                }
            )
        }
    }
}
