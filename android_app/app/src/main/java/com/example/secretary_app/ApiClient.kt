package com.example.secretary_app

import android.content.Context
import io.ktor.client.* 
import io.ktor.client.call.*
import io.ktor.client.engine.android.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class ChatResponse(val message: String)

class ApiClient private constructor(private val context: Context) {

    private val credentialStorage = CredentialStorage(context)

    private val client = HttpClient(Android) {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true
            })
        }
        defaultRequest {
            url {
                protocol = URLProtocol.HTTPS
                host = "voicemate-11gi.onrender.com"
            }
        }
    }

    suspend fun postChat(text: String): Result<ChatResponse> = runCatching {
        val email = credentialStorage.getEmail() ?: throw Exception("Email not saved")
        val password = credentialStorage.getPassword() ?: throw Exception("Password not saved")

        client.post("/api/chat") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "email" to email,
                "password" to password,
                "inputValue" to text
            ))
        }.body()
    }

    companion object {
        @Volatile private var INSTANCE: ApiClient? = null

        fun getInstance(context: Context): ApiClient = INSTANCE ?: synchronized(this) {
            INSTANCE ?: ApiClient(context.applicationContext).also { INSTANCE = it }
        }
    }
}
