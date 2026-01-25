package com.example.secretary_app.data.local

import com.example.secretary_app.data.supabase.HttpClientProvider
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.UUID

class LocalStore(private val dao: SyncRecordDao) {
    private val json = HttpClientProvider.json

    suspend fun list(table: String, userId: String?): List<JsonObject> {
        val rows = dao.getByTable(table)
        return rows.mapNotNull { row ->
            val obj = json.parseToJsonElement(row.dataJson).jsonObject
            if (userId == null) obj else {
                val rowUser = obj["user_id"].asStringOrNull()
                if (rowUser == null || rowUser == userId) obj else null
            }
        }
    }

    suspend fun upsert(
        table: String,
        recordId: String,
        userId: String?,
        obj: JsonObject,
        updatedAt: String? = null,
        dirty: Boolean = true
    ) {
        val dataJson = json.encodeToString(JsonElement.serializer(), obj)
        dao.upsertAll(
            listOf(
                SyncRecordEntity(
                    tableName = table,
                    recordId = recordId,
                    userId = userId,
                    dataJson = dataJson,
                    updatedAt = updatedAt,
                    dirty = dirty,
                    deleted = false
                )
            )
        )
    }

    suspend fun delete(table: String, recordId: String) {
        val existing = dao.getByTable(table).firstOrNull { it.recordId == recordId } ?: return
        val deleted = existing.copy(dirty = true, deleted = true)
        dao.upsertAll(listOf(deleted))
    }

    suspend fun deleteAll(table: String, userId: String?) {
        val rows = dao.getByTable(table)
        val toDelete = rows.filter { row ->
            if (userId == null) true else row.userId == null || row.userId == userId
        }.map { it.copy(dirty = true, deleted = true) }
        if (toDelete.isNotEmpty()) dao.upsertAll(toDelete)
    }

    fun newId(): String = UUID.randomUUID().toString()

    fun ensureUserId(obj: JsonObject, userId: String?): JsonObject {
        if (userId.isNullOrBlank()) return obj
        return if (obj.containsKey("user_id")) obj else {
            buildJsonObject {
                obj.forEach { (k, v) -> put(k, v) }
                put("user_id", JsonPrimitive(userId))
            }
        }
    }
}

private fun JsonElement?.asStringOrNull(): String? {
    val primitive = this as? JsonPrimitive ?: return null
    return primitive.content
}
