package com.example.secretary_app

import android.util.Log
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

object SupabaseRealtimeService {

    private const val TAG = "SupabaseRealtime"
    // IMPORTANT: Replace with your actual Supabase URL and Key
    private const val SUPABASE_URL = "https://<YOUR_PROJECT_ID>.supabase.co"
    private const val SUPABASE_KEY = "<YOUR_ANON_KEY>"

    private var client: SupabaseClient? = null

    fun getInstance(): SupabaseClient {
        if (client == null) {
            client = createSupabaseClient(
                supabaseUrl = SUPABASE_URL,
                supabaseKey = SUPABASE_KEY
            ) {
                install(Realtime)
            }
        }
        return client!!
    }

    fun subscribeToActionChanges(scope: CoroutineScope, onNewAction: (Map<String, Any?>) -> Unit) {
        val client = getInstance()
        val channel = client.channel("public:actions")
        
        scope.launch(Dispatchers.IO) {
            client.realtime.connect()
            channel.postgresChangeFlow<PostgresAction.Insert>("public")
                .onEach { event: PostgresAction.Insert ->
                    Log.d(TAG, "New action received: ${event.record}")
                    onNewAction(event.record)
                }
                .launchIn(this)
            
            channel.subscribe()
        }
    }

    fun unsubscribe() {
        client?.let {
            CoroutineScope(Dispatchers.IO).launch {
                it.realtime.disconnect()
            }
        }
        client = null
    }
}
