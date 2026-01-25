package com.example.secretary_app.network

import android.content.Context
import android.content.SharedPreferences

/**
 * A simple class to manage storing and retrieving an authentication token
 * using SharedPreferences.
 */
class TokenStorage(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("auth_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
    }

    /**
     * Saves the authentication token to SharedPreferences.
     */
    fun saveToken(token: String) {
        prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
    }

    /**
     * Retrieves the authentication token from SharedPreferences.
     * Returns null if the token is not found.
     */
    fun getToken(): String? {
        return prefs.getString(KEY_AUTH_TOKEN, null)
    }

    /**
     * Clears the authentication token from SharedPreferences.
     */
    fun clearToken() {
        prefs.edit().remove(KEY_AUTH_TOKEN).apply()
    }
}
