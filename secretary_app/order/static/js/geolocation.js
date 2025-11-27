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

export async function reverseGeocodeCoordinates(latitude, longitude) {
  console.log("[DEBUG] reverseGeocodeCoordinates started. Lat:", latitude, "Lng:", longitude);
  // OpenStreetMap Nominatim APIを使用
  const NominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
  console.log("[DEBUG] Fetching URL:", NominatimUrl);

  try {
    const response = await fetch(NominatimUrl);
    console.log("[DEBUG] Received response. Status:", response.status, "Ok:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DEBUG] Nominatim API returned non-OK status: ${response.status}. Response text:`, errorText);
      return { type: "api_error", status: response.status, errorText: errorText };
    }

    const data = await response.json();
    console.log("[DEBUG] Parsed Nominatim JSON data:", data);

    if (data && data.display_name) {
      // Nominatimのdisplay_nameは詳細すぎる場合があるので、より短い住所を構築を試みる
      let address = data.address.country || '';
      if (data.address.state) address = `${data.address.state}${address}`;
      if (data.address.city) address = `${data.address.city}${address}`;
      if (data.address.town) address = `${data.address.town}${address}`;
      if (data.address.village) address = `${data.address.village}${address}`;
      if (data.address.suburb) address = `${data.address.suburb}${address}`;
      if (data.address.road) address = `${data.address.road}${address}`;
      if (data.address.house_number) address = `${data.address.house_number}-${address}`;
      
      // より一般的な形式に調整 (例: 日本の住所の場合)
      let formattedAddress = '';
      if (data.address.country) formattedAddress = data.address.country;
      if (data.address.state) formattedAddress = `${data.address.state}${formattedAddress}`;
      if (data.address.city) formattedAddress = `${data.address.city}${formattedAddress}`;
      else if (data.address.town) formattedAddress = `${data.address.town}${formattedAddress}`;
      else if (data.address.village) formattedAddress = `${data.address.village}${formattedAddress}`;
      if (data.address.suburb) formattedAddress = `${data.address.suburb}${formattedAddress}`; // 区など
      if (data.address.road) formattedAddress = `${formattedAddress}${data.address.road}`;
      if (data.address.house_number) formattedAddress = `${formattedAddress}${data.address.house_number}`;
      
      if (data.address.country_code === "jp") {
          let jpAddressParts = [];
          if (data.address.state) jpAddressParts.push(data.address.state); // 都道府県
          if (data.address.city) jpAddressParts.push(data.address.city); // 市
          if (data.address.town) jpAddressParts.push(data.address.town); // 町
          if (data.address.suburb) jpAddressParts.push(data.address.suburb); // 区
          if (data.address.road) jpAddressParts.push(data.address.road); // 通り名
          if (data.address.house_number) jpAddressParts.push(data.address.house_number); // 番地
          
          if (jpAddressParts.length > 0) {
              formattedAddress = jpAddressParts.join('');
          } else {
              formattedAddress = data.display_name; // 詳細すぎる場合はNominatimの表示名をそのまま使用
          }
      } else {
          formattedAddress = data.display_name; // 日本以外の住所はNominatimの表示名をそのまま使用
      }

      console.log("[DEBUG] Reverse geocoding successful. Address:", formattedAddress);
      return { type: "success", address: formattedAddress, lat: latitude, lng: longitude };
    } else {
      console.log("[DEBUG] Reverse geocoding failed. No display_name found in response.");
      return { type: "no_address" };
    }
  } catch (error) {
    console.error("[DEBUG] An error occurred during Nominatim fetch or processing:", error);
    return { type: "network_error", error: error };
  }
}

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ type: "unsupported", message: "お使いのブラウザは位置情報取得に対応していません。" });
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            type: "success",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          let message = "";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = "位置情報の利用が許可されていません。";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "位置情報が取得できませんでした。";
              break;
            case error.TIMEOUT:
              message = "位置情報取得がタイムアウトしました。";
              break;
            default:
              message = "原因不明のエラーが発生しました。";
              break;
          }
          reject({ type: "error", code: error.code, message: message });
        }
      );
    }
  });
}
