package com.example.secretary_app

import android.os.Bundle
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.accompanist.web.WebView
import com.google.accompanist.web.rememberWebViewState

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Match system bars to app background.
        window.navigationBarColor = Color.parseColor("#0b1116")
        window.statusBarColor = Color.parseColor("#2b2f35")
        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = false

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
                    it.setBackgroundColor(Color.parseColor("#0b1116"))
                    it.overScrollMode = android.view.View.OVER_SCROLL_NEVER
                }
            )
        }
    }
}
