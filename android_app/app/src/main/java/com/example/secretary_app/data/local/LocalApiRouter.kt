package com.example.secretary_app.data.local

import android.net.Uri
import com.example.secretary_app.data.supabase.HttpClientProvider
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.Calendar
import java.util.Locale

data class ApiResponse(val status: Int, val body: JsonElement)

class LocalApiRouter(private val store: LocalStore) {
    private val json = HttpClientProvider.json

    suspend fun handle(method: String, url: String, body: String?, userId: String?): ApiResponse {
        val uri = Uri.parse("http://local$url")
        val path = uri.path ?: "/"
        val segments = uri.pathSegments
        val normalizedMethod = method.uppercase()

        return when {
            path.startsWith("/api/categories") -> handleCategories(normalizedMethod, segments, body, userId)
            path.startsWith("/api/finance/summary") -> handleFinanceSummary(userId)
            path.startsWith("/api/finance/goal") -> handleFinanceGoal(normalizedMethod, body, userId)
            path.startsWith("/api/finance/bulk-delete") -> handleFinanceBulkDelete(body, userId)
            path.startsWith("/api/finance") -> handleFinance(normalizedMethod, segments, body, userId)
            path.startsWith("/api/memos") -> handleMemos(normalizedMethod, segments, uri, body, userId)
            path.startsWith("/api/tasks") -> handleTasks(normalizedMethod, segments, body, userId)
            path.startsWith("/api/user_settings") -> handleUserSettings(normalizedMethod, body, userId)
            path.startsWith("/api/custom_orders") -> handleCustomOrders(normalizedMethod, segments, body, userId)
            path.startsWith("/order/api/past_addresses") -> handlePastAddresses(normalizedMethod, body, userId)
            path.startsWith("/order/api/pending_actions") -> handlePendingActions(segments, userId)
            path.startsWith("/api/switchbot/devices") -> ApiResponse(200, json.parseToJsonElement("[]"))
            path.startsWith("/web_api/chat") -> ApiResponse(200, json.parseToJsonElement("{\"reply\":\"オフラインのため応答できません\",\"fallback_to_voicemate\":false}"))
            path.startsWith("/web_api/abort") -> ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            path.startsWith("/web_api/transform_tone") -> ApiResponse(200, json.parseToJsonElement("{\"text\":\"\"}"))
            else -> ApiResponse(404, json.parseToJsonElement("{\"error\":\"not_supported\"}"))
        }
    }

    private suspend fun handleCategories(method: String, segments: List<String>, body: String?, userId: String?): ApiResponse {
        return when {
            method == "GET" -> {
                val list = store.list("categories", userId)
                ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
            }
            method == "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: store.newId()
                val data = store.ensureUserId(obj, userId)
                store.upsert("categories", id, userId, data)
                ApiResponse(200, data)
            }
            method == "DELETE" && segments.lastOrNull() == "clear" -> {
                store.deleteAll("categories", userId)
                ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            }
            method == "DELETE" && segments.size >= 3 -> {
                val id = segments.last()
                store.delete("categories", id)
                ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handleFinance(method: String, segments: List<String>, body: String?, userId: String?): ApiResponse {
        return when {
            method == "GET" -> {
                val list = store.list("finance", userId)
                ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
            }
            method == "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: System.currentTimeMillis().toString()
                val data = store.ensureUserId(obj, userId)
                store.upsert("finance", id, userId, data)
                ApiResponse(200, data)
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handleFinanceBulkDelete(body: String?, userId: String?): ApiResponse {
        val obj = json.parseToJsonElement(body ?: "{}").jsonObject
        val ids = obj["ids"]?.jsonArray?.mapNotNull { it.asStringOrNull() } ?: emptyList()
        ids.forEach { store.delete("finance", it) }
        return ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
    }

    private suspend fun handleFinanceSummary(userId: String?): ApiResponse {
        val records = store.list("finance", userId)
        var balance = 0.0
        var monthly = 0.0
        var daily = 0.0
        val cal = Calendar.getInstance()
        val year = cal.get(Calendar.YEAR)
        val month = cal.get(Calendar.MONTH) + 1
        val day = cal.get(Calendar.DAY_OF_MONTH)
        val todayStr = String.format(Locale.US, "%04d-%02d-%02d", year, month, day)
        val currentMonth = todayStr.substring(0, 7)
        records.forEach { r ->
            val type = r["type"].asStringOrNull()
            val amount = r["amount"].asDoubleOrZero()
            val date = r["date"].asStringOrNull()
            if (type == "income") balance += amount else balance -= amount
            if (date != null && date.startsWith(currentMonth) && type != "income") monthly += amount
            if (date == todayStr && type != "income") daily += amount
        }
        val res = buildJsonObject {
            put("balance", JsonPrimitive(balance))
            put("monthly_expense", JsonPrimitive(monthly))
            put("daily_expense", JsonPrimitive(daily))
        }
        return ApiResponse(200, res)
    }

    private suspend fun handleFinanceGoal(method: String, body: String?, userId: String?): ApiResponse {
        return when (method) {
            "GET" -> {
                val list = store.list("finance_goals", userId)
                val current = list.maxByOrNull { it["updated_at"].asStringOrNull() ?: "" }
                ApiResponse(200, current ?: json.parseToJsonElement("{}"))
            }
            "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: store.newId()
                val data = store.ensureUserId(obj, userId)
                store.upsert("finance_goals", id, userId, data)
                ApiResponse(200, data)
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handleMemos(method: String, segments: List<String>, uri: Uri, body: String?, userId: String?): ApiResponse {
        return when {
            method == "GET" -> {
                val q = uri.getQueryParameter("q")?.lowercase() ?: ""
                val type = uri.getQueryParameter("type") ?: "all"
                val start = uri.getQueryParameter("start") ?: ""
                val end = uri.getQueryParameter("end") ?: ""
                val list = store.list("memos", userId).filter { memo ->
                    val title = memo["title"].asStringOrNull() ?: ""
                    val content = memo["content"].asStringOrNull() ?: ""
                    val createdAt = memo["created_at"].asStringOrNull() ?: ""
                    val matchText = when (type) {
                        "title" -> title
                        "content" -> content
                        else -> "$title $content"
                    }
                    val okText = q.isBlank() || matchText.lowercase().contains(q)
                    val okStart = start.isBlank() || createdAt >= start
                    val okEnd = end.isBlank() || createdAt <= end
                    okText && okStart && okEnd
                }
                ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
            }
            method == "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: store.newId()
                val data = store.ensureUserId(obj, userId)
                store.upsert("memos", id, userId, data)
                ApiResponse(200, data)
            }
            method == "PUT" && segments.size >= 3 -> {
                val id = segments.last()
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val data = store.ensureUserId(obj, userId)
                store.upsert("memos", id, userId, data)
                ApiResponse(200, data)
            }
            method == "DELETE" && segments.size >= 3 -> {
                val id = segments.last()
                store.delete("memos", id)
                ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            }
            method == "POST" && segments.lastOrNull() == "bulk" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val ids = obj["ids"]?.jsonArray?.mapNotNull { it.asStringOrNull() } ?: emptyList()
                ids.forEach { store.delete("memos", it) }
                ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handleTasks(method: String, segments: List<String>, body: String?, userId: String?): ApiResponse {
        return when {
            method == "GET" -> {
                val list = store.list("tasks", userId)
                ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
            }
            method == "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: store.newId()
                val data = store.ensureUserId(obj, userId)
                store.upsert("tasks", id, userId, data)
                ApiResponse(200, data)
            }
            method == "PUT" && segments.size >= 3 -> {
                val id = segments.last()
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val data = store.ensureUserId(obj, userId)
                store.upsert("tasks", id, userId, data)
                ApiResponse(200, data)
            }
            method == "DELETE" && segments.size >= 3 -> {
                val id = segments.last()
                store.delete("tasks", id)
                ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handleUserSettings(method: String, body: String?, userId: String?): ApiResponse {
        return when (method) {
            "GET" -> {
                val settingsList = store.list("user_settings", userId)
                val userList = store.list("users", userId)
                val currentSettings = settingsList.firstOrNull()?.let { json.parseToJsonElement(it["dataJson"].asStringOrNull() ?: "{}") } ?: buildJsonObject {}
                val currentUser = userList.firstOrNull()?.let { json.parseToJsonElement(it["dataJson"].asStringOrNull() ?: "{}") } ?: buildJsonObject {}
                val merged = buildJsonObject {
                    currentSettings.jsonObject.forEach { (k, v) -> put(k, v) }
                    currentUser.jsonObject.forEach { (k, v) -> put(k, v) }
                }
                ApiResponse(200, merged)
            }
            "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["user_id"].asStringOrNull() ?: (userId ?: store.newId())
                val data = store.ensureUserId(obj, userId)
                store.upsert("user_settings", id, userId, data)
                ApiResponse(200, data)
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handleCustomOrders(method: String, segments: List<String>, body: String?, userId: String?): ApiResponse {
        return when {
            method == "GET" -> {
                val list = store.list("custom_orders", userId)
                ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
            }
            method == "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: System.currentTimeMillis().toString()
                val data = store.ensureUserId(obj, userId)
                store.upsert("custom_orders", id, userId, data)
                ApiResponse(200, data)
            }
            method == "PUT" && segments.size >= 3 -> {
                val id = segments.last()
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val data = store.ensureUserId(obj, userId)
                store.upsert("custom_orders", id, userId, data)
                ApiResponse(200, data)
            }
            method == "DELETE" && segments.size >= 3 -> {
                val id = segments.last()
                store.delete("custom_orders", id)
                ApiResponse(200, json.parseToJsonElement("{\"ok\":true}"))
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handlePastAddresses(method: String, body: String?, userId: String?): ApiResponse {
        return when (method) {
            "GET" -> {
                val list = store.list("past_addresses", userId)
                ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
            }
            "POST" -> {
                val obj = json.parseToJsonElement(body ?: "{}").jsonObject
                val id = obj["id"].asStringOrNull() ?: store.newId()
                val data = store.ensureUserId(obj, userId)
                store.upsert("past_addresses", id, userId, data)
                ApiResponse(200, data)
            }
            else -> ApiResponse(405, json.parseToJsonElement("{\"error\":\"method_not_allowed\"}"))
        }
    }

    private suspend fun handlePendingActions(segments: List<String>, userId: String?): ApiResponse {
        val list = store.list("pending_user_actions", userId)
        return ApiResponse(200, json.parseToJsonElement(json.encodeToString(ListSerializer, list)))
    }
}

// Json serialization helpers for List<JsonObject>
private val ListSerializer = kotlinx.serialization.builtins.ListSerializer(kotlinx.serialization.json.JsonObject.serializer())

private fun JsonElement?.asStringOrNull(): String? {
    val primitive = this as? JsonPrimitive ?: return null
    return primitive.content
}

private fun JsonElement?.asDoubleOrZero(): Double {
    val primitive = this as? JsonPrimitive ?: return 0.0
    return primitive.content.toDoubleOrNull() ?: 0.0
}
