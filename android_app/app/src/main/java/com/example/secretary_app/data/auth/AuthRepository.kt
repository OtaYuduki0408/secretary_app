package com.example.secretary_app.data.auth

import android.content.Context
import com.example.secretary_app.CredentialStorage
import com.example.secretary_app.data.supabase.HttpClientProvider
import com.example.secretary_app.data.supabase.SupabaseAuthApi
import java.time.Instant

class AuthRepository(private val context: Context) {
    private val sessionStorage = UserSessionStorage(context)
    private val credentialStorage = CredentialStorage(context)
    private val authApi = SupabaseAuthApi(HttpClientProvider.client)

    fun getCachedUserId(): String? = sessionStorage.getUserId()

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

        val res = authApi.signInWithPassword(email, password)
        val expiresAtEpoch = Instant.now().epochSecond + res.expiresIn
        sessionStorage.saveSession(res.user.id, res.accessToken, res.refreshToken, expiresAtEpoch)
        return UserSession(res.user.id, res.accessToken, res.refreshToken)
    }
}

data class UserSession(
    val userId: String,
    val accessToken: String,
    val refreshToken: String
)
