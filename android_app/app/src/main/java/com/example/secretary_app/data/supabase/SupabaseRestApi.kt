package com.example.secretary_app.data.supabase

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.delete
import io.ktor.client.request.post
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.HttpHeaders
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

class SupabaseRestApi(private val client: HttpClient) {
    suspend fun selectAll(
        table: String,
        accessToken: String?,
        userFilter: Pair<String, String>? = null,
        inFilter: Pair<String, List<String>>? = null
    ): JsonArray {
        val url = "${SupabaseConfig.URL}/rest/v1/$table"
        return client.get(url) {
            header("apikey", SupabaseConfig.ANON_KEY)
            if (!accessToken.isNullOrBlank()) {
                header("Authorization", "Bearer $accessToken")
            }
            contentType(ContentType.Application.Json)
            parameter("select", "*")
            userFilter?.let { (col, value) ->
                parameter(col, "eq.$value")
            }
            inFilter?.let { (col, values) ->
                val joined = values.joinToString(",")
                parameter(col, "in.($joined)")
            }
        }.body()
    }

    suspend fun upsert(
        table: String,
        accessToken: String?,
        payload: JsonArray,
        onConflict: String
    ): JsonArray {
        val url = "${SupabaseConfig.URL}/rest/v1/$table"
        return client.post(url) {
            header("apikey", SupabaseConfig.ANON_KEY)
            if (!accessToken.isNullOrBlank()) {
                header("Authorization", "Bearer $accessToken")
            }
            header(HttpHeaders.Prefer, "resolution=merge-duplicates")
            contentType(ContentType.Application.Json)
            parameter("on_conflict", onConflict)
            setBody(payload)
        }.body()
    }

    suspend fun deleteById(
        table: String,
        accessToken: String?,
        pk: String,
        id: String
    ) {
        val url = "${SupabaseConfig.URL}/rest/v1/$table"
        client.delete(url) {
            header("apikey", SupabaseConfig.ANON_KEY)
            if (!accessToken.isNullOrBlank()) {
                header("Authorization", "Bearer $accessToken")
            }
            contentType(ContentType.Application.Json)
            parameter(pk, "eq.$id")
        }.body<JsonElement>()
    }
}
