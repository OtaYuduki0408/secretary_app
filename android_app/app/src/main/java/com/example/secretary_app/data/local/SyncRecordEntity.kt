package com.example.secretary_app.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity

@Entity(
    tableName = "sync_records",
    primaryKeys = ["table_name", "record_id"]
)
data class SyncRecordEntity(
    @ColumnInfo(name = "table_name") val tableName: String,
    @ColumnInfo(name = "record_id") val recordId: String,
    @ColumnInfo(name = "user_id") val userId: String?,
    @ColumnInfo(name = "data_json") val dataJson: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String?,
    @ColumnInfo(name = "dirty") val dirty: Boolean = false,
    @ColumnInfo(name = "deleted") val deleted: Boolean = false
)
