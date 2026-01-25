package com.example.secretary_app.data.supabase

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SupabaseAuthRequest(
    val email: String,
    val password: String
)

@Serializable
data class SupabaseAuthUser(
    val id: String
)

@Serializable
data class SupabaseAuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Long,
    val user: SupabaseAuthUser
)

class SupabaseAuthApi(private val client: HttpClient) {
    suspend fun signInWithPassword(email: String, password: String): SupabaseAuthResponse {
        val url = "${SupabaseConfig.URL}/auth/v1/token?grant_type=password"
        return client.post(url) {
            header("apikey", SupabaseConfig.ANON_KEY)
            contentType(ContentType.Application.Json)
            setBody(SupabaseAuthRequest(email, password))
        }.body()
    }
}
