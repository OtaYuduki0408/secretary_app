package com.example.secretary_app.web

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import com.example.secretary_app.MainActivity
import com.example.secretary_app.data.sync.SyncConflictPolicy
import com.example.secretary_app.data.sync.SyncManager
import com.example.secretary_app.data.sync.SyncScheduler
import com.example.secretary_app.data.sync.SyncSettingsRepository
import com.example.secretary_app.data.sync.NetworkUtils
import com.example.secretary_app.data.local.AppDatabase
import com.example.secretary_app.data.local.ApiResponse
import com.example.secretary_app.data.local.LocalApiRouter
import com.example.secretary_app.data.local.LocalStore
import com.example.secretary_app.data.auth.AuthRepository
import com.example.secretary_app.data.supabase.HttpClientProvider
import com.example.secretary_app.data.supabase.SupabaseConfig
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

class SyncBridge(private val context: Context, private val mainActivity: MainActivity) {
    private val scope = CoroutineScope(Dispatchers.IO)
    private val settingsRepo = SyncSettingsRepository(context)
    private val authRepository = AuthRepository(context)
    private val httpClient: HttpClient = HttpClientProvider.client

    @JavascriptInterface
    fun setConflictPolicy(policy: String) {
        val parsed = runCatching { SyncConflictPolicy.valueOf(policy) }
            .getOrDefault(SyncConflictPolicy.LOCAL_WINS)
        scope.launch {
            settingsRepo.updateConflictPolicy(parsed)
        }
    }

    @JavascriptInterface
    fun setIntervalHours(hours: Int) {
        scope.launch {
            settingsRepo.updateIntervalHours(hours)
            SyncScheduler.schedulePeriodic(context, hours)
        }
    }

    @JavascriptInterface
    fun runSync(policy: String?): String {
        val parsed = runCatching { SyncConflictPolicy.valueOf(policy ?: "") }
            .getOrDefault(SyncConflictPolicy.LOCAL_WINS)
        return runBlocking {
            val result = SyncManager(context).syncAll(parsed)
            "{\"success\":${result.success},\"message\":\"${result.message}\"}"
        }
    }

    @JavascriptInterface
    fun getSettingsJson(): String {
        val settings = runBlocking { settingsRepo.settingsFlow.first() }
        return "{\"conflictPolicy\":\"${settings.conflictPolicy.name}\",\"intervalHours\":${settings.intervalHours}}"
    }

    @JavascriptInterface
    fun setWakeWords(wakeWords: String) {
        scope.launch {
            settingsRepo.updateWakeWords(wakeWords)
        }
    }

    @JavascriptInterface
    fun signIn(email: String, password: String): String {
        return runBlocking {
            runCatching { authRepository.signIn(email, password) }
                .fold(
                    onSuccess = {
                        "{\"success\":true,\"userId\":\"${it.userId}\"}"
                    },
                    onFailure = {
                        val msg = it.message ?: "login_failed"
                        "{\"success\":false,\"error\":${JSONObject.quote(msg)}}"
                    }
                )
        }
    }

    @JavascriptInterface
    fun request(method: String, url: String, body: String?): String {
        return runBlocking {
            if (url.startsWith("/api/") || url.startsWith("/web_api/")) {
                val response = forwardRequestToWebServer(method, url, body)
                "{\"status\":${response.status},\"body\":${response.body}}"
            } else {
                val dao = AppDatabase.get(context).syncRecordDao()
                val store = LocalStore(dao)
                val session = authRepository.ensureSession()
                val userId = session?.userId ?: "local"
                val router = LocalApiRouter(store)
                val response = router.handle(method, url, body, userId)
                val isWrite = method.uppercase() != "GET"
                if (isWrite && NetworkUtils.isOnline(context)) {
                    val policy = settingsRepo.settingsFlow.first().conflictPolicy
                    scope.launch {
                        SyncManager(context).syncAll(policy)
                    }
                }
                "{\"status\":${response.status},\"body\":${response.body}}"
            }
        }
    }

    private suspend fun forwardRequestToWebServer(method: String, url: String, body: String?): ApiResponse {
        val session = authRepository.ensureSession()
        if (session == null) {
            return ApiResponse(401, JSONObject("{'error':'unauthorized'}"))
        }

        try {
            val response = httpClient.request("${SupabaseConfig.URL}$url") {
                this.method = HttpMethod(method)
                header("Authorization", "Bearer ${session.accessToken}")
                if (body != null) {
                    setBody(body)
                }
            }
            val responseBody = response.bodyAsText()
            return ApiResponse(response.status.value, JSONObject(responseBody))
        } catch (e: Exception) {
            return ApiResponse(500, JSONObject("{'error':'${e.message}'}"))
        }
    }

    @JavascriptInterface
    fun startVoiceRecognition() {
        mainActivity.startLocalVoiceInteraction(null)
    }

    @JavascriptInterface
    fun clearCacheAndReload() {
        mainActivity.clearCacheAndReload()
    }
}
