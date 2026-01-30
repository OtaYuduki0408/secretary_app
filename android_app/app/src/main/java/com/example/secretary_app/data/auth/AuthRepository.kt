package com.example.secretary_app.data.auth

import android.content.Context
import com.example.secretary_app.CredentialStorage
import com.example.secretary_app.data.supabase.HttpClientProvider
import com.example.secretary_app.data.supabase.SupabaseAuthApi
import com.example.secretary_app.data.supabase.SupabaseAuthResponse
import io.ktor.client.call.body
import java.time.Instant

class AuthRepository(private val context: Context) {
    private val sessionStorage = UserSessionStorage(context)
    private val credentialStorage = CredentialStorage(context)
    private val authApi = SupabaseAuthApi(HttpClientProvider.client)

    fun getCachedUserId(): String? = sessionStorage.getUserId()

    suspend fun signIn(email: String, password: String): UserSession {
        val httpResponse = authApi.signInWithPassword(email, password)
        val res: SupabaseAuthResponse = httpResponse.body()

        if (httpResponse.status.value >= 400 || res.error != null) {
            throw Exception(res.errorDescription ?: res.error ?: "ログインに失敗しました")
        }

        if (res.accessToken == null || res.refreshToken == null || res.expiresIn == null || res.user == null) {
            throw Exception("ログインレスポンスが不完全です")
        }

        credentialStorage.saveCredentials(email, password)
        val expiresAtEpoch = Instant.now().epochSecond + res.expiresIn
        sessionStorage.saveSession(res.user.id, res.accessToken, res.refreshToken, expiresAtEpoch)
        return UserSession(res.user.id, res.accessToken, res.refreshToken)
    }

    suspend fun ensureSession(): UserSession? {
        val userId = sessionStorage.getUserId()
        val accessToken = sessionStorage.getAccessToken()
        val refreshToken = sessionStorage.getRefreshToken()
        val expiresAt = sessionStorage.getExpiresAt()

        if (!userId.isNullOrBlank() && !accessToken.isNullOrBlank()) {
            val now = Instant.now().epochSecond
            if (expiresAt == 0L || expiresAt > now) {
                return UserSession(userId, accessToken, refreshToken ?: "")
            }
        }

        val email = credentialStorage.getEmail()
        val password = credentialStorage.getPassword()
        if (email.isNullOrBlank() || password.isNullOrBlank()) return null

        try {
            val httpResponse = authApi.signInWithPassword(email, password)
            val res: SupabaseAuthResponse = httpResponse.body()

            if (httpResponse.status.value >= 400 || res.error != null) {
                return null // Fail silently if session refresh fails
            }
            if (res.accessToken == null || res.refreshToken == null || res.expiresIn == null || res.user == null) {
                return null
            }

            val expiresAtEpoch = Instant.now().epochSecond + res.expiresIn
            sessionStorage.saveSession(res.user.id, res.accessToken, res.refreshToken, expiresAtEpoch)
            return UserSession(res.user.id, res.accessToken, res.refreshToken)
        } catch (e: Exception) {
            return null
        }
    }

    fun signOut() {
        sessionStorage.clear()
        credentialStorage.clearCredentials()
    }
}

data class UserSession(
    val userId: String,
    val accessToken: String,
    val refreshToken: String
)
