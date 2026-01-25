package com.example.secretary_app.data.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.first

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val settingsRepo = SyncSettingsRepository(applicationContext)
        val settings = settingsRepo.settingsFlow.first()
        val manager = SyncManager(applicationContext)
        val result = manager.syncAll(settings.conflictPolicy)
        return if (result.success) Result.success() else Result.retry()
    }
}
