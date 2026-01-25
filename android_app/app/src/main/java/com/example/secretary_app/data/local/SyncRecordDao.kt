package com.example.secretary_app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface SyncRecordDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(records: List<SyncRecordEntity>)

    @Query("SELECT * FROM sync_records WHERE table_name = :tableName")
    suspend fun getByTable(tableName: String): List<SyncRecordEntity>

    @Query("SELECT * FROM sync_records WHERE table_name = :tableName AND dirty = 1")
    suspend fun getDirtyByTable(tableName: String): List<SyncRecordEntity>

    @Query("UPDATE sync_records SET dirty = 0 WHERE table_name = :tableName AND record_id IN (:recordIds)")
    suspend fun clearDirty(tableName: String, recordIds: List<String>)

    @Query("UPDATE sync_records SET dirty = 0 WHERE table_name = :tableName")
    suspend fun clearAllDirty(tableName: String)
}
