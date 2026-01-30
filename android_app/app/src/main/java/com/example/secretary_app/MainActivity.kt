package com.example.secretary_app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.graphics.Color
import android.os.Build
import android.util.Log
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.accompanist.web.WebView
import com.google.accompanist.web.rememberWebViewState
import com.example.secretary_app.web.SyncBridge
import com.example.secretary_app.data.auth.UserSessionStorage
import com.example.secretary_app.data.auth.AuthRepository
import com.example.secretary_app.data.sync.SyncManager
import com.example.secretary_app.data.sync.SyncSettingsRepository
import com.example.secretary_app.service.WakeWordDetectionService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.webkit.WebView as AndroidWebView

class MainActivity : ComponentActivity() {
    private var webViewRef: AndroidWebView? = null
    private val TAG = "MainActivity"

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Log.d(TAG, "RECORD_AUDIO permission granted. Starting WakeWordDetectionService.")
            startService(Intent(this, WakeWordDetectionService::class.java))
        } else {
            Log.w(TAG, "RECORD_AUDIO permission denied.")
            // Optionally, show a toast or a dialog to the user explaining why the permission is needed.
        }
    }

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

        val sessionStorage = UserSessionStorage(this)
        val initialUrl = if (!sessionStorage.getUserId().isNullOrBlank()) {
            "file:///android_asset/main.html"
        } else {
            "file:///android_asset/login.html"
        }

        setContent {
            val webViewState = rememberWebViewState(url = initialUrl)
            Box(modifier = Modifier.fillMaxSize().background(ComposeColor(0xFF0B1116))) {
                WebView(
                    state = webViewState,
                    modifier = Modifier.fillMaxSize(),
                    onCreated = {
                        webViewRef = it
                        it.settings.javaScriptEnabled = true
                        it.settings.domStorageEnabled = true
                        it.settings.allowFileAccess = true
                        it.settings.allowContentAccess = true
                        it.settings.allowFileAccessFromFileURLs = true
                        it.settings.allowUniversalAccessFromFileURLs = true
                        it.setBackgroundColor(Color.parseColor("#0b1116"))
                        it.overScrollMode = android.view.View.OVER_SCROLL_NEVER
                        it.addJavascriptInterface(SyncBridge(this@MainActivity, this@MainActivity), "AndroidSync")
                        it.webChromeClient = object : WebChromeClient() {
                            override fun onPermissionRequest(request: PermissionRequest) {
                                val resources = request.resources
                                if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                                } else {
                                    request.deny()
                                }
                            }
                        }
                    }
                )
            }
        }

        val scope = CoroutineScope(Dispatchers.IO)
        val settingsRepo = SyncSettingsRepository(this)
        val authRepository = AuthRepository(this)

        scope.launch {
            val session = authRepository.ensureSession()
            if (session != null) {
                val policy = settingsRepo.settingsFlow.first().conflictPolicy
                SyncManager(this@MainActivity).syncAll(policy)
                withContext(Dispatchers.Main) {
                    if (initialUrl.endsWith("login.html")) {
                        webViewRef?.loadUrl("file:///android_asset/main.html")
                    }
                }
            }
        }
        requestAudioPermission()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getBooleanExtra("start_voice_interaction", false) == true) {
            runOnUiThread { startLocalVoiceInteraction(null) }
        }
    }
    
    private fun requestAudioPermission() {
        when (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)) {
            PackageManager.PERMISSION_GRANTED -> {
                Log.d(TAG, "RECORD_AUDIO permission already granted. Starting WakeWordDetectionService.")
                startService(Intent(this, WakeWordDetectionService::class.java))
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    fun clearCacheAndReload() {
        runOnUiThread {
            webViewRef?.clearCache(true)
            webViewRef?.reload()
        }
    }
}
