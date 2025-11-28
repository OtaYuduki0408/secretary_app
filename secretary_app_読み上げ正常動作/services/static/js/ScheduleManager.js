export class ScheduleManager {
  constructor() {
    this.accessToken = null;
    this.clientId = null;
    this.scopes = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar"
    ];
  }
 
  log(...args) {
    console.log("[ScheduleManager]", ...args);
  }
 
  // ✅ 设置服务器返回的 Access Token（由 oauth-callback.html 通知）
  setAccessToken(token) {
    this.accessToken = token;
    this.log("Access token set:", token ? "OK" : "empty");
  }
 
  // ✅ 打开 Google 登录窗口（服务器端 OAuth 流程）
  handleAuthClick() {
    const authUrl = "https://127.0.0.1:5000/google-login";
    const popup = window.open(
      authUrl,
      "googleLogin",
      "width=520,height=600"
    );
    if (!popup) {
      alert("ポップアップがブロックされました。ポップアップを許可してください。");
      return;
    }
    this.log("Opened OAuth popup window:", authUrl);
  }
 
  // ✅ 使用已授权的 token 调用 Google Calendar API（例：获取事件列表）
  async listEvents() {
    if (!this.accessToken) {
      alert("先にGoogleログインを完了してください。");
      return [];
    }
    const now = new Date().toISOString();
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${weekLater}&orderBy=startTime&singleEvents=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!res.ok) {
      this.log("listEvents failed:", res.status, await res.text());
      throw new Error("イベントの取得に失敗しました。");
    }
    const data = await res.json();
    this.log("Events:", data.items);
    return data.items;
  }
 
  // ✅ 添加日程（直接调用 Google API）
  async addEvent(title, startTime, endTime) {
    if (!this.accessToken) {
      alert("Googleログインが必要です。");
      return null;
    }
    const event = {
      summary: title,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    const data = await res.json();
    this.log("Event added:", data);
    return data;
  }
 
  // ✅ 删除日程
  async deleteEvent(eventId) {
    if (!this.accessToken) {
      alert("Googleログインが必要です。");
      return;
    }
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      this.log("deleteEvent failed:", res.status, await res.text());
      throw new Error("予定の削除に失敗しました。");
    }
    this.log("Event deleted:", eventId);
  }
}
