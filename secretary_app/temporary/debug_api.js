async function debugSwitchBotApi() {
  console.log('--- [DEBUG] Starting /api/switchbot/devices fetch test ---');
  try {
    const response = await fetch('/api/switchbot/devices');

    console.log(`[DEBUG] Response Status Code: ${response.status}`);
    console.log(`[DEBUG] Response ok: ${response.ok}`);
    
    console.log('[DEBUG] Response Headers:');
    for (let [key, value] of response.headers) {
      console.log(`  ${key}: ${value}`);
    }

    const responseBodyText = await response.text();
    console.log('[DEBUG] Response Body (as text):', responseBodyText);

    try {
      const jsonBody = JSON.parse(responseBodyText);
      console.log('[DEBUG] Response Body (parsed as JSON):', jsonBody);
    } catch (e) {
      console.error('[DEBUG] Failed to parse response body as JSON:', e);
    }

  } catch (error) {
    console.error('--- [DEBUG] An error occurred during the fetch operation ---', error);
  }
}

debugSwitchBotApi();
