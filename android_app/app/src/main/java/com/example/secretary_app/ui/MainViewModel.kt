package com.example.secretary_app.ui

import android.app.Application
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.secretary_app.CredentialStorage
import com.example.secretary_app.SupabaseRealtimeService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update


data class MainUiState(
    val saveSuccess: Boolean = false,
    val email: String = "",
    val password: String = "",
    val latestAction: String? = null // For Supabase
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val credentialStorage = CredentialStorage(application)

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        // Load saved credentials on startup
        val email = credentialStorage.getEmail() ?: ""
        val password = credentialStorage.getPassword() ?: ""
        _uiState.update { it.copy(email = email, password = password) }

        // Start listening for Supabase changes
        SupabaseRealtimeService.subscribeToActionChanges(viewModelScope) { newActionRecord ->
            _uiState.update { it.copy(latestAction = newActionRecord.toString()) }
        }
    }

    fun onEmailChange(email: String) {
        _uiState.update { it.copy(email = email, saveSuccess = false) }
    }

    fun onPasswordChange(password: String) {
        _uiState.update { it.copy(password = password, saveSuccess = false) }
    }

    fun saveCredentials() {
        credentialStorage.saveCredentials(
            email = _uiState.value.email,
            password = _uiState.value.password
        )
        _uiState.update { it.copy(saveSuccess = true) }
        Toast.makeText(getApplication(), "認証情報を保存しました", Toast.LENGTH_SHORT).show()
    }

    override fun onCleared() {
        super.onCleared()
        // Stop listening when the ViewModel is destroyed
        SupabaseRealtimeService.unsubscribe()
    }
}
