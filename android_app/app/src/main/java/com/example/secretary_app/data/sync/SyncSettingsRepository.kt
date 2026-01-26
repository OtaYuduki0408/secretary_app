package com.example.secretary_app.data.sync

import android.content.Context
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.syncSettingsStore by preferencesDataStore(name = "sync_settings")

class SyncSettingsRepository(private val context: Context) {
    companion object {
        private val KEY_CONFLICT = stringPreferencesKey("conflict_policy")
        private val KEY_INTERVAL_HOURS = intPreferencesKey("interval_hours")
        private val KEY_WAKE_WORDS = stringPreferencesKey("wake_words")
    }

    val settingsFlow: Flow<SyncSettings> = context.syncSettingsStore.data.map { prefs ->
        val conflictRaw = prefs[KEY_CONFLICT] ?: SyncConflictPolicy.LOCAL_WINS.name
        val interval = prefs[KEY_INTERVAL_HOURS] ?: 24
        val wakeWords = prefs[KEY_WAKE_WORDS] ?: "サイレントメイト"
        SyncSettings(
            conflictPolicy = runCatching { SyncConflictPolicy.valueOf(conflictRaw) }
                .getOrDefault(SyncConflictPolicy.LOCAL_WINS),
            intervalHours = interval,
            wakeWords = wakeWords
        )
    }

    suspend fun updateConflictPolicy(policy: SyncConflictPolicy) {
        context.syncSettingsStore.edit { prefs ->
            prefs[KEY_CONFLICT] = policy.name
        }
    }

    suspend fun updateIntervalHours(hours: Int) {
        context.syncSettingsStore.edit { prefs ->
            prefs[KEY_INTERVAL_HOURS] = hours
        }
    }

    suspend fun updateWakeWords(wakeWords: String) {
        context.syncSettingsStore.edit { prefs ->
            prefs[KEY_WAKE_WORDS] = wakeWords
        }
    }
}
