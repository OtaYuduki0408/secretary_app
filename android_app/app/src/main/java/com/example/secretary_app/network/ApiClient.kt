package com.example.secretary_app.network

import io.ktor.client.*
import io.ktor.client.call.body
import io.ktor.client.engine.android.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// APIから返されるカテゴリーのデータを表すクラス
@Serializable
data class Category(
    val id: String,
    val name: String
)

// /api/chat へのリクエストボディ
@Serializable
data class ChatRequest(val inputValue: String)

// /api/chat からのレスポンスボディ
@Serializable
data class ChatResponse(
    val action: String? = null,
    val message: String? = null,
    val status: String? = null
    // "data"フィールドは内容が変動するため、一旦省略
)

object ApiClient {
    // Androidエミュレータから見たホストPCのlocalhostを指すアドレス
    private const val BASE_URL = "https://voicemate-11gi.onrender.com/"

    // Ktor HTTPクライアントのインスタンス
    val client = HttpClient(Android) {
        // JSONの変換設定
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true // 不明なキーは無視する
            })
        }
    }

    // カテゴリー一覧を取得する関数
    suspend fun getCategories(): List<Category> {
        return client.get("${BASE_URL}api/categories").body()
    }

    // チャットメッセージを送信する関数
    suspend fun postChat(text: String): ChatResponse {
        val request = ChatRequest(inputValue = text)
        return client.post("${BASE_URL}api/chat") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()
    }
}
