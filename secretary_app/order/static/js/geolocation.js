export async function geocodeAddress(address) {
  console.log("[DEBUG] geocodeAddress started. Address:", address);
  const GeospatialUrl = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";
  const requestUrl = GeospatialUrl + encodeURIComponent(address) + "&json=true";
  console.log("[DEBUG] Fetching URL:", requestUrl);

  try {
    const response = await fetch(requestUrl);
    console.log("[DEBUG] Received response. Status:", response.status, "Ok:", response.ok);

    if (!response.ok) { // APIからのHTTPエラーレスポンス（504など）
      const errorText = await response.text(); // エラーレスポンスのテキストも取得
      console.error(`[DEBUG] API returned non-OK status: ${response.status}. Response text:`, errorText);
      return { type: "api_error", status: response.status, errorText: errorText };
    }

    const responseText = await response.text();
    console.log("[DEBUG] Raw response text:", responseText);

    // JSONパースを試みる
    let data;
    try {
      data = JSON.parse(responseText);
      console.log("[DEBUG] Parsed JSON data:", data);
    } catch (jsonError) {
      console.error("[DEBUG] JSON parsing failed, but API status was OK. Response text might not be JSON:", jsonError);
      return { type: "malformed_response", error: jsonError, responseText: responseText };
    }

    if (data && data.length > 0 && data[0].geometry && data[0].geometry.coordinates) {
      const lng = data[0].geometry.coordinates[0];
      const lat = data[0].geometry.coordinates[1];
      console.log("[DEBUG] Geocoding successful. Lat:", lat, "Lng:", lng);
      return { type: "success", lat: lat, lng: lng, display_name: address };
    } else {
      console.log("[DEBUG] Geocoding failed. No coordinates found in response.");
      return { type: "no_coordinates" };
    }
  } catch (error) { // ネットワークエラーなど
    console.error("[DEBUG] An error occurred during fetch or processing:", error);
    return { type: "network_error", error: error };
  }
}
