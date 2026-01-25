export async function geocodeAddress(address, apiKey) {
  console.log("[DEBUG] geocodeAddress started. Address:", address);
  const requestUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  console.log("[DEBUG] Fetching URL:", requestUrl);

  try {
    const response = await fetch(requestUrl);
    console.log("[DEBUG] Received response. Status:", response.status, "Ok:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DEBUG] API returned non-OK status: ${response.status}. Response text:`, errorText);
      return { type: "api_error", status: response.status, errorText: errorText };
    }

    const data = await response.json();
    console.log("[DEBUG] Parsed JSON data:", data);

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      const lat = location.lat;
      const lng = location.lng;
      console.log("[DEBUG] Geocoding successful. Lat:", lat, "Lng:", lng);
      return { type: "success", lat: lat, lng: lng, display_name: data.results[0].formatted_address };
    } else {
      console.log("[DEBUG] Geocoding failed. Status:", data.status, "Error message:", data.error_message);
      return { type: "no_coordinates", status: data.status, error_message: data.error_message };
    }
  } catch (error) {
    console.error("[DEBUG] An error occurred during fetch or processing:", error);
    return { type: "network_error", error: error };
  }
}

export async function reverseGeocodeCoordinates(latitude, longitude, apiKey) {
  console.log("[DEBUG] reverseGeocodeCoordinates started. Lat:", latitude, "Lng:", longitude);
  const requestUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
  console.log("[DEBUG] Fetching URL:", requestUrl);

  try {
    const response = await fetch(requestUrl);
    console.log("[DEBUG] Received response. Status:", response.status, "Ok:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DEBUG] API returned non-OK status: ${response.status}. Response text:`, errorText);
      return { type: "api_error", status: response.status, errorText: errorText };
    }

    const data = await response.json();
    console.log("[DEBUG] Parsed JSON data:", data);

    if (data.status === 'OK' && data.results.length > 0) {
      const formattedAddress = data.results[0].formatted_address;
      console.log("[DEBUG] Reverse geocoding successful. Address:", formattedAddress);
      return { type: "success", address: formattedAddress, lat: latitude, lng: longitude };
    } else {
      console.log("[DEBUG] Reverse geocoding failed. Status:", data.status, "Error message:", data.error_message);
      return { type: "no_address", status: data.status, error_message: data.error_message };
    }
  } catch (error) {
    console.error("[DEBUG] An error occurred during fetch or processing:", error);
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
