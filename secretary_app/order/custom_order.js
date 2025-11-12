// custom_order.js
 
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("orderForm");
 
  // フォーム送信時の登録処理
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
 
    const data = {
      trigger: document.getElementById("trigger").value,
      commandName: document.getElementById("commandName").value,
      condition: document.getElementById("condition").value,
      repeat: document.getElementById("repeat").value
    };
 
    // DBへ保存（Flask経由）
    const res = await fetch("/api/custom_orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
 
    const result = await res.json();
    console.log("登録完了:", result);
  });
});
 
// ---- 音声テキストを受け取る側 ----
export async function checkCustomOrder(spokenText) {
  const res = await fetch("/api/custom_orders");
  const orders = await res.json();
 
  // 一致するトリガーを検索
  const matched = orders.find(o => spokenText.includes(o.trigger));
 
  if (matched) {
    console.log("✅ Custom Order 検知");
    console.log("ID:", matched.id);
    console.log("命令名:", matched.commandName);
    console.log("条件式:", matched.condition);
    console.log("繰り返し:", matched.repeat);
  }
}
// custom_order.js
 
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("orderForm");
 
  // フォーム登録処理
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
 
    const data = {
      trigger: document.getElementById("trigger").value,
      commandName: document.getElementById("commandName").value,
      condition: document.getElementById("condition").value,
      repeat: document.getElementById("repeat").value
    };
 
    const res = await fetch("/api/custom_orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
 
    const result = await res.json();
    console.log("登録完了:", result);
  });
});
 
// ---- Custom Order 検知 + 実行 ----
export async function checkCustomOrder(spokenText) {
  const res = await fetch("/api/custom_orders");
  const orders = await res.json();
 
  const matched = orders.find(o => spokenText.includes(o.trigger));
 
  if (matched) {
    console.log("✅ Custom Order 検知");
    console.log("ID:", matched.id);
    console.log("命令名:", matched.commandName);
    console.log("条件式:", matched.condition);
    console.log("繰り返し:", matched.repeat);
 
    // 命令実行
    executeCustomOrder(matched);
  }
}
 
// ---- 命令実行ロジック ----
async function executeCustomOrder(order) {
  switch (order.commandName) {
    case "今日のカレンダーを読む":
    case "カレンダー読み上げ":
    case "今日の予定":
      const res = await fetch("/api/calendar/today");
      const data = await res.json();
 
      const message = data.events.length > 0
        ? `今日の予定は${data.events.join("、")}です。`
        : "今日は予定がありません。";
 
      console.log("📅", message);
      speak(message);
      break;
 
    default:
      console.log("⚙ 未対応の命令:", order.commandName);
      speak(`命令 ${order.commandName} はまだ登録されていません。`);
  }
}
 
// ---- 音声読み上げ（SpeechSynthesis） ----
function speak(text) {
  const uttr = new SpeechSynthesisUtterance(text);
  uttr.lang = "ja-JP";
  speechSynthesis.speak(uttr);
}
// ============================================
// Custom_Order.js
// ============================================
 
// サンプルの登録データ（DB代わり）
// 実際はバックエンドDBから取得する形に
const customOrders = [
  {
    id: 1,
    triggerType: "voice",
    triggerValue: "おはよう",
    actions: ["カレンダー情報を取得", "時刻を読み上げ"],
  },
  {
    id: 2,
    triggerType: "time",
    triggerValue: "07:00",
    actions: ["ニュースを読み上げ", "天気を表示"],
  },
  {
    id: 3,
    triggerType: "gps",
    triggerValue: { lat: 35.6812, lon: 139.7671, radius: 500 }, // 東京駅500m以内
    actions: ["『会社到着』と通知", "出勤記録を保存"],
  },
];
 
// ===================================================
// GPSトリガー監視処理
// ===================================================
function startGPSTriggerCheck() {
  if (!navigator.geolocation) {
    console.warn("このブラウザでは位置情報がサポートされていません。");
    return;
  }
 
  console.log("📍 GPSトリガー監視を開始");
 
  // 定期的に位置を監視
  setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log(`現在位置: ${latitude}, ${longitude}`);
 
        // 登録済みのGPSトリガーをチェック
        customOrders.forEach((order) => {
          if (order.triggerType === "gps") {
            const { lat, lon, radius } = order.triggerValue;
            const distance = getDistance(latitude, longitude, lat, lon);
 
            if (distance <= radius) {
              console.log(`✅ GPSトリガー発動: ${order.id}`);
              executeActions(order.actions);
            }
          }
        });
      },
      (error) => {
        console.error("GPS取得エラー:", error.message);
      }
    );
  }, 10000); // 10秒おきにチェック
}
 
// ===================================================
// 2点間の距離を求める関数（メートル）
// ===================================================
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 地球の半径 (m)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
 
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 
  return R * c;
}
 
// ===================================================
// 命令実行部分（例）
// ===================================================
function executeActions(actions) {
  actions.forEach((action) => {
    console.log(`🧠 実行: ${action}`);
 
    // ここに実際の機能を割り当てる
    if (action.includes("通知")) {
      alert("📢 " + action);
    }
    if (action.includes("出勤記録")) {
      console.log("📒 出勤記録をデータベースに保存（仮）");
    }
  });
}
 
// ===================================================
// ページ読み込み時の処理
// ===================================================
window.addEventListener("DOMContentLoaded", () => {
  console.log("Custom_Orderシステム起動");
  startGPSTriggerCheck();
});
 