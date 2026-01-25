package com.example.secretary_app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.example.secretary_app.ui.MainViewModel
import com.example.secretary_app.ui.MainUiState
import kotlin.system.exitProcess

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* ... */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SecretaryAppTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    val uiState by viewModel.uiState.collectAsState()
                    AssistantSettingsScreen(
                        uiState = uiState,
                        onEmailChange = viewModel::onEmailChange,
                        onPasswordChange = viewModel::onPasswordChange,
                        onSaveClick = viewModel::saveCredentials,
                        onRequestMicPermission = { requestPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                        onRestartApp = { restartApp() }
                    )
                }
            }
        }
    }

    private fun restartApp() {
        // ... (restart logic)
    }
}

@Composable
fun AssistantSettingsScreen(
    uiState: MainUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSaveClick: () -> Unit,
    onRequestMicPermission: () -> Unit,
    onRestartApp: () -> Unit
) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Credentials Section
        Text(text = "API認証設定", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedTextField(
            value = uiState.email,
            onValueChange = onEmailChange,
            label = { Text("メールアドレス") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = uiState.password,
            onValueChange = onPasswordChange,
            label = { Text("パスワード") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onSaveClick, modifier = Modifier.fillMaxWidth()) {
            Text("認証情報を保存")
        }
        
        Divider(modifier = Modifier.padding(vertical = 32.dp))

        // Realtime Action Display
        Text(text = "Supabase Realtime", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))
        Text("Latest Action: ${uiState.latestAction ?: "N/A"}")

        Divider(modifier = Modifier.padding(vertical = 32.dp))

        // Assistant Settings Section
        Text(text = "アシスタント設定", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = {
            val intent = Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)
            context.startActivity(intent)
        }) {
            Text("1. デフォルトのアシスタントとして設定")
        }
        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = onRequestMicPermission) {
            Text("2. マイクの権限を許可する")
        }

        Spacer(modifier = Modifier.weight(1f))

        // --- Debug Section ---
        Text(text = "デバッグ用", color = Color.Gray)
        Button(onClick = onRestartApp, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) {
            Text("アプリを再起動")
        }
        // --- End Debug Section ---
        
        Text(text = "ver1.4") // Version bump
    }
}

@Composable
fun SecretaryAppTheme(content: @Composable () -> Unit) {
    MaterialTheme {
        content()
    }
}

@Preview(showBackground = true)
@Composable
fun DefaultPreview() {
    SecretaryAppTheme {
        AssistantSettingsScreen(
            uiState = MainUiState(latestAction = "Sample Action"),
            onEmailChange = {},
            onPasswordChange = {},
            onSaveClick = {},
            onRequestMicPermission = {},
            onRestartApp = {}
        )
    }
}
