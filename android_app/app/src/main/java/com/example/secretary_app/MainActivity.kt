package com.example.secretary_app

import android.os.Bundle
import android.graphics.Color
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }

        setContent {
            val webViewState = rememberWebViewState(url = "file:///android_asset/main.html")
            Box(modifier = Modifier.fillMaxSize().background(ComposeColor(0xFF0B1116))) {
                WebView(
                    state = webViewState,
                    modifier = Modifier.fillMaxSize(),
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
}
