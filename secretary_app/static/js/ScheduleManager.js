<<<<<<< HEAD
const clientId = "964406409299-dd8g3vumtmeuaht9tmq9f5l21otetfn7.apps.googleusercontent.com";
const apiKey = "AIzaSyDUqgdhLHjWeTqrwYLr2LItsU3C7GYYCDI";
const redirectUri = "https://127.0.0.1:5000/oauth-callback";

export class ScheduleManager {
    constructor() {
        this.accessToken = null;
    }

    handleAuthClick() {
        const scope = "https://www.googleapis.com/auth/calendar";
        const authUrl =
            "https://accounts.google.com/o/oauth2/v2/auth?" +
            new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirectUri,
                response_type: "token",
                scope: scope,
            });

        const width = 500, height = 600;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        window.open(authUrl, "googleAuth", `width=${width},height=${height},top=${top},left=${left}`);
    }

    setAccessToken(token) {
        this.accessToken = token;
        gapi.load("client", async () => {
            await gapi.client.init({ apiKey });
            gapi.client.setToken({ access_token: token });
        });
    }

    /**
     * 
     * @param {str} title タイトル 
     * @param {str} description 説明
     * @param {str} start 開始時間
     * @param {str} end 終了時間
     * @param {str} log 登録
     * @returns 
     */
    async addEvent(title, description, start, end, log) {
        await gapi.client.load("calendar", "v3");

        const startTime = start ? new Date(start).toISOString() : new Date().toISOString();
        const endTime = end ? new Date(end).toISOString() : new Date(Date.now() + 60 * 60 * 1000).toISOString();

        const event = {
            summary: title,
            description,
            start: { dateTime: startTime },
            end: { dateTime: endTime },
        };

        const response = await gapi.client.calendar.events.insert({
            calendarId: "primary",
            resource: event,
        });
        log(`イベント追加: ${response.result.id} (${response.result.summary})`);
    }

    async deleteEvent(eventId, log) {
        await gapi.client.load("calendar", "v3");
        await gapi.client.calendar.events.delete({
            calendarId: "primary",
            eventId: eventId,
        });
        log(`イベント削除: ${eventId}`);
    }

async listEvents(start, end, log) {
    await gapi.client.load("calendar", "v3");

    // 安全解析时间字符串并返回 ISO 字符串
    function toSafeISOString(str, fallbackToNow = false) {
        // 如果已经是 Date 对象，直接返回 ISO
        if (str instanceof Date) return str.toISOString();

        if (!str || typeof str !== "string") {
            if (fallbackToNow) return new Date().toISOString();
            throw new Error("invalid_time_string");
        }

        // 处理常见格式 "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
        let s = str.trim();

        // 有些地方会传 "YYYY-MM-DD 24:00:00" -> 等价于 next day 00:00:00
        if (s.includes("24:00:00")) {
            s = s.replace("24:00:00", "00:00:00");
            // 先尝试构造日期，再加一天
            const d = new Date(s.replace(" ", "T"));
            if (isNaN(d.getTime())) {
                // 如果依然无效，回退到当前时间
                return new Date().toISOString();
            }
            d.setDate(d.getDate() + 1);
            return d.toISOString();
        }

        // 如果格式是 "YYYY-MM-DD HH:MM:SS"（存在空格和时间部分），把空格替成 'T'
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
            s = s.replace(/\s+/, "T");
        }

        // 如果是 "YYYY-MM-DD" 的形式，补上 00:00:00
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            s = s + "T00:00:00";
        }

        // 最后尝试解析
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }

        // 解析失败：根据 fallbackToNow 返回 now 的 ISO 或抛错误
        if (fallbackToNow) return new Date().toISOString();
        throw new Error("invalid_time_string");
    }

    // 调试输出（若报错可查看控制台）
    console.log("[ScheduleManager.listEvents] raw start:", start, "raw end:", end);

    let startDateISO, endDateISO;
    try {
        startDateISO = toSafeISOString(start, true); // fallback to now
    } catch (e) {
        console.warn("[listEvents] start parse failed:", e);
        startDateISO = new Date().toISOString();
    }
    try {
        endDateISO = toSafeISOString(end, true); // fallback to now+1day
        // 如果 end 等于 fallback now，则把 end 加 1 天（避免 start>end）
        if (endDateISO === new Date().toISOString()) {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            endDateISO = d.toISOString();
        }
    } catch (e) {
        console.warn("[listEvents] end parse failed:", e);
        const d = new Date();
        d.setDate(d.getDate() + 1);
        endDateISO = d.toISOString();
    }

    // 继续使用解析后的 ISO 时间调用 API
    const response = await gapi.client.calendar.events.list({
        calendarId: "primary",
        timeMin: startDateISO,
        timeMax: endDateISO,
        singleEvents: true,
        orderBy: "startTime",
    });

    const events = response.result.items || [];

    if (!events.length) {
        log("該当期間にイベントはありません。");
    } else {
        log(`=== ${events.length} 件のイベント ===`);
        events.forEach(ev => {
            const s = ev.start.dateTime || ev.start.date;
            log(`📅 ${s} : ${ev.summary} [${ev.id}]`);
        });
    }

    // 一定要返回 events，这样上层可以拿到数组
    return events;
}
=======
const apiKey = "AIzaSyDUqgdhLHjWeTqrwYLr2LItsU3C7GYYCDI";

class ScheduleManager {
    constructor() {
        this.schedules = [];
        this.apiKey = apiKey;
        this.initialized = false;
        this.clientId = "964406409299-dd8g3vumtmeuaht9tmq9f5l21otetfn7.apps.googleusercontent.com";
        this.redirectUri = `${window.location.origin}/oauth-callback.html`;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.SCOPES = "https://www.googleapis.com/auth/calendar.events";
    }

    /** Google API初期化 */
    async initializeGapi() {
        if (this.initialized) return;
        return new Promise((resolve) => {
            const script = document.createElement("script");
            script.src = "https://apis.google.com/js/api.js";
            script.onload = async () => {
                await new Promise((r) => gapi.load("client:auth2", r));
                await gapi.client.init({
                    apiKey: this.apiKey,
                    discoveryDocs: [
                        "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
                    ],
                });
                this.initialized = true;
                resolve();
            };
            document.body.appendChild(script);
        });
    }

    /** OAuth認証 */
    async authenticate() {
        return new Promise((resolve) => {
            const scope = this.SCOPES;
            const authUrl =
                `https://accounts.google.com/o/oauth2/v2/auth` +
                `?client_id=${encodeURIComponent(this.clientId)}` +
                `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
                `&response_type=token` +
                `&scope=${encodeURIComponent(scope)}` +
                `&include_granted_scopes=true` +
                `&prompt=consent`;

            const popup = window.open(authUrl, "oauth2_popup", "width=500,height=600");
            if (!popup) {
                alert("ポップアップがブロックされました。許可してください。");
                resolve(false);
                return;
            }

            let messageReceived = false;

            const messageHandler = (event) => {
                if (event.origin !== window.location.origin) return;
                messageReceived = true;
                if (event.data.type === "oauth2-success") {
                    this.accessToken = event.data.token.access_token;
                    this.tokenExpiry =
                        Date.now() + event.data.token.expires_in * 1000;
                    resolve(true);
                }
                window.removeEventListener("message", messageHandler);
                popup.close();
            };

            window.addEventListener("message", messageHandler);

            const checkPopup = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkPopup);
                    window.removeEventListener("message", messageHandler);
                    if (!messageReceived) resolve(false);
                }
            }, 1000);
        });
    }

    /** 認証状態確認 */
    isAuthenticated() {
        return (
            this.accessToken &&
            this.tokenExpiry &&
            Date.now() < this.tokenExpiry
        );
    }

    /** 認証＋同期 */
    async syncWithGapi() {
        console.log("Googleカレンダーへの同期を開始します...");
        if (!this.isAuthenticated()) {
            const success = await this.authenticate();
            if (!success) {
                console.log("認証に失敗しました。");
                return;
            }
        }
        await this.syncWithFetch();
    }

    /** fetchでGoogleカレンダーに予定を送信 */
    async syncWithFetch() {
        for (const schedule of this.schedules) {
            const event = {
                summary: schedule.title,
                start: { dateTime: schedule.start },
                end: { dateTime: schedule.end },
            };

            const response = await fetch(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(event),
                }
            );

            if (!response.ok) {
                let errorText;
                try {
                    errorText = await response.text();
                    console.error("APIエラー:", errorText);
                } catch {
                    console.error("APIエラー (JSON解析失敗)");
                }
            } else {
                const data = await response.json();
                console.log("同期完了:", data.summary);
            }
        }
    }

    /** 予定追加 */
    addSchedule(title, start, end) {
        this.schedules.push({ title, start, end });
        console.log("予定を追加しました:", title);
    }

    /** 予定一覧表示 */
    listSchedules() {
        console.log("現在の予定一覧:");
        this.schedules.forEach((s, i) =>
            console.log(`${i + 1}. ${s.title} (${s.start} - ${s.end})`)
        );
    }
>>>>>>> main/NAOYA
}
