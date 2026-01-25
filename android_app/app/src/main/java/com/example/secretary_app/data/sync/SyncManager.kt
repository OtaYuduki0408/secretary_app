package com.example.secretary_app.data.sync

import android.content.Context
import com.example.secretary_app.data.auth.AuthRepository
import com.example.secretary_app.data.local.AppDatabase
import com.example.secretary_app.data.local.SyncRecordEntity
import com.example.secretary_app.data.supabase.HttpClientProvider
import com.example.secretary_app.data.supabase.SupabaseRestApi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

class SyncManager(private val context: Context) {
    private val dao = AppDatabase.get(context).syncRecordDao()
    private val restApi = SupabaseRestApi(HttpClientProvider.client)
    private val authRepository = AuthRepository(context)
    private val json = HttpClientProvider.json

    suspend fun syncAll(policy: SyncConflictPolicy): SyncResult {
        val session = authRepository.ensureSession() ?: return SyncResult(false, "missing_session")
        val userId = session.userId
        val accessToken = session.accessToken

        val orderIds = mutableListOf<String>()
        var total = 0

        for (table in SyncTables.all) {
            if (policy == SyncConflictPolicy.LOCAL_WINS) {
                pushDirty(table, accessToken)
            }
            val rows = fetchTable(table, accessToken, userId, orderIds)
            val records = rows.mapNotNull { element ->
                toRecord(table, element, userId)
            }
            if (records.isNotEmpty()) {
                dao.upsertAll(records)
                total += records.size
            }
            if (policy == SyncConflictPolicy.SERVER_WINS) {
                dao.clearAllDirty(table.name)
            }

            if (table.name == "custom_orders") {
                orderIds.clear()
                orderIds.addAll(records.map { it.recordId })
            }
        }

        return SyncResult(true, "synced:$total")
    }

    private suspend fun pushDirty(table: SyncTable, accessToken: String) {
        val dirty = dao.getDirtyByTable(table.name)
        if (dirty.isEmpty()) return

        val deletes = dirty.filter { it.deleted }
        val upserts = dirty.filter { !it.deleted }

        if (upserts.isNotEmpty()) {
            val payload = JsonArray(upserts.map { json.parseToJsonElement(it.dataJson) })
            restApi.upsert(table.name, accessToken, payload, table.pk)
            dao.clearDirty(table.name, upserts.map { it.recordId })
        }
        if (deletes.isNotEmpty()) {
            deletes.forEach { restApi.deleteById(table.name, accessToken, table.pk, it.recordId) }
            dao.clearDirty(table.name, deletes.map { it.recordId })
        }
    }

    private suspend fun fetchTable(
        table: SyncTable,
        accessToken: String,
        userId: String,
        orderIds: List<String>
    ): List<JsonElement> {
        if (table.dependsOnOrders && orderIds.isEmpty()) return emptyList()
        val userFilter = table.userIdColumn?.let { it to userId }
        val inFilter = if (table.dependsOnOrders && orderIds.isNotEmpty()) {
            "order_id" to orderIds
        } else {
            null
        }

        val result: JsonArray = restApi.selectAll(
            table = table.name,
            accessToken = accessToken,
            userFilter = userFilter,
            inFilter = inFilter
        )
        return result
    }

    private fun toRecord(
        table: SyncTable,
        element: JsonElement,
        fallbackUserId: String
    ): SyncRecordEntity? {
        val obj = element.jsonObject
        val idValue = obj[table.pk] ?: return null
        val recordId = jsonElementToString(idValue)
        val updatedAt = table.updatedAtColumn?.let { col -> obj[col]?.let { jsonElementToString(it) } }
        val userId = table.userIdColumn?.let { col -> obj[col]?.let { jsonElementToString(it) } } ?: fallbackUserId
        val dataJson = json.encodeToString(JsonElement.serializer(), obj)
        return SyncRecordEntity(
            tableName = table.name,
            recordId = recordId,
            userId = userId,
            dataJson = dataJson,
            updatedAt = updatedAt,
            dirty = false,
            deleted = false
        )
    }

    private fun jsonElementToString(element: JsonElement): String {
        return when (element) {
            is JsonPrimitive -> element.content
            else -> element.toString()
        }
    }
}

data class SyncResult(
    val success: Boolean,
    val message: String
)
