package com.example.secretary_app

import android.content.Context
import android.content.SharedPreferences

/**
 * Manages storing and retrieving user credentials (email and password).
 */
class CredentialStorage(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("auth_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_USER_PASSWORD = "user_password"
    }

    /**
     * Saves the user's email and password.
     */
    fun saveCredentials(email: String, password: String) {
        prefs.edit()
            .putString(KEY_USER_EMAIL, email)
            .putString(KEY_USER_PASSWORD, password)
            .apply()
    }

    /**
     * Retrieves the user's email.
     */
    fun getEmail(): String? {
        return prefs.getString(KEY_USER_EMAIL, null)
    }

    /**
     * Retrieves the user's password.
     */
    fun getPassword(): String? {
        return prefs.getString(KEY_USER_PASSWORD, null)
    }

    /**
     * Clears all stored credentials.
     */
    fun clearCredentials() {
        prefs.edit()
            .remove(KEY_USER_EMAIL)
            .remove(KEY_USER_PASSWORD)
            .apply()
    }
}
