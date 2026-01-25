package com.example.secretary_app.data.sync

enum class SyncConflictPolicy {
    LOCAL_WINS,
    SERVER_WINS
}

data class SyncSettings(
    val conflictPolicy: SyncConflictPolicy = SyncConflictPolicy.LOCAL_WINS,
    val intervalHours: Int = 24
)
