export class ScheduleManager {
  constructor() {
    this.accessToken = null;
    this.clientId = null;
    this.scopes = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      // "https://www.googleapis.com/auth/calendar" // Disabled
    ];
  }
 
  log(...args) {
    console.log("[ScheduleManager (DEPRECATED)]", ...args);
  }
 
  // ✅ 设置服务器返回的 Access Token（由 oauth-callback.html 通知）
  setAccessToken(token) {
    this.accessToken = token;
    this.log("setAccessToken called, but this module is deprecated.");
  }
 
  // ✅ 打开 Google 登录窗口（服务器端 OAuth 流程）
  handleAuthClick() {
    this.log("handleAuthClick called, but this feature is disabled.");
    alert("Googleカレンダー連携機能は現在使用できません。");
  }
 
  // ✅ 使用已授权的 token 调用 Google Calendar API（例：获取事件列表）
  async listEvents() {
    this.log("listEvents called, but this feature is disabled.");
    return []; // Return empty array to prevent errors in calling code
  }
 
  // ✅ 添加日程（直接调用 Google API）
  async addEvent(title, startTime, endTime) {
    this.log("addEvent called, but this feature is disabled.");
    return null; // Return null to prevent errors in calling code
  }
 
  // ✅ 删除日程
  async deleteEvent(eventId) {
    this.log("deleteEvent called, but this feature is disabled.");
  }
}
