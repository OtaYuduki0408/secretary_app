const clientId = "67874123915-sbvbq5g2qo6o2scting658b7qhn7s22a.apps.googleusercontent.com";
const apiKey = "AIzaSyD3J_To68zeoUn7hOo1fDr9iH9NJ46UPls";
const redirectUri = `${window.location.origin}/oauth-callback`;

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
}
