package com.example.secretary_app.data.sync

data class SyncTable(
    val name: String,
    val pk: String,
    val userIdColumn: String? = null,
    val updatedAtColumn: String? = null,
    val dependsOnOrders: Boolean = false
)

object SyncTables {
    val all = listOf(
        SyncTable(name = "actions", pk = "id", userIdColumn = "user_id", updatedAtColumn = "timestamp"),
        SyncTable(name = "categories", pk = "id", userIdColumn = "user_id", updatedAtColumn = "created_at"),
        SyncTable(name = "commands", pk = "id", updatedAtColumn = "updated_at"),
        SyncTable(name = "custom_orders", pk = "id", userIdColumn = "user_id", updatedAtColumn = "created_at"),
        SyncTable(name = "custom_actions", pk = "id", dependsOnOrders = true),
        SyncTable(name = "custom_conditions", pk = "id", dependsOnOrders = true),
        SyncTable(name = "finance", pk = "id", userIdColumn = "user_id"),
        SyncTable(name = "finance_goals", pk = "id", userIdColumn = "user_id", updatedAtColumn = "updated_at"),
        SyncTable(name = "google_credentials", pk = "user_id", userIdColumn = "user_id", updatedAtColumn = "updated_at"),
        SyncTable(name = "memos", pk = "id", userIdColumn = "user_id", updatedAtColumn = "updated_at"),
        SyncTable(name = "past_addresses", pk = "id", userIdColumn = "user_id", updatedAtColumn = "created_at"),
        SyncTable(name = "pending_user_actions", pk = "id", userIdColumn = "user_id", updatedAtColumn = "created_at"),
        SyncTable(name = "records", pk = "id", userIdColumn = "user_id", updatedAtColumn = "time"),
        SyncTable(name = "user_api_keys", pk = "user_id", userIdColumn = "user_id", updatedAtColumn = "created_at"),
        SyncTable(name = "user_current_location", pk = "user_id", userIdColumn = "user_id", updatedAtColumn = "updated_at"),
        SyncTable(name = "user_settings", pk = "user_id", userIdColumn = "user_id", updatedAtColumn = "updated_at"),
        SyncTable(name = "users", pk = "id")
    )
}
