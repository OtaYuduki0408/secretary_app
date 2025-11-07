const clientId = "67874123915-sbvbq5g2qo6o2scting658b7qhn7s22a.apps.googleusercontent.com";
const apiKey = "AIzaSyD3J_To68zeoUn7hOo1fDr9iH9NJ46UPls";
const redirectUri = `${window.location.origin}/oauth-callback`;

export class ScheduleManager {
    constructor() {
        this.accessToken = null;
        this.gapiLoaded = false;
        this.loadGapi();
    }
    loadGapi() {
        return new Promise((resolve) => {
            if (window.gapi && !this.gapiLoaded) {
                gapi.load("client", () => {
                    gapi.client.init({ apiKey }).then(() => {
                        this.gapiLoaded = true;
                        resolve();
                    });
                });
            } else {
                resolve();
            }
        });
    }

    handleAuthClick() {
        const scope = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";
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
        if (window.gapi && gapi.client) {
            gapi.client.setToken({ access_token: token });
        } else {
            gapi.client.setToken({ access_token: token });
        }
    }

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

    async ensureCalendarLoaded() {
        if (!this.gapiLoaded) {
            await this.loadGapi();
        }
        if (!gapi.client.calendar) {
            await gapi.client.load("calendar", "v3");
        }
    }

    async sendEmail(to, subject, message, log) {
        if (!this.accessToken) {
            throw new Error("No access token set");
        }

        const rawMessage =this.createRawEmail(to, subject, message);
        try {
            const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + this.accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    raw: rawMessage
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to send email');
            }
                
            const result = await response.json();
            log(`Email成功: ${result.id}`);
            return result;

        } catch (error) {
            log(`Error失敗: ${error.message}`);
            throw error;
        }
    }

    createRawEmail(to, subject, message) {
        const emailLines = [
            'Content-Type: text/plain; charset="UTF-8"',
            'MIME-Version: 1.0',
            'Content-Transfer-Encoding: 7bit',
            `To: ${to}`,
            `Subject: ${subject}`,
            '',
            message
        ];
        const email = emailLines.join('\r\n').trim();

        return btoa(unescape(encodeURIComponent(email)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    
    async listEmails(maxResults =10, log) {
        if (!this.accessToken) {
            throw new Error("No access token set");
        }
        try {
            const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`, {
                headers: {
                    'Authorization': 'Bearer '+ this.accessToken,
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch emails');
            }

            const result = await response.json();
            log(`取得したメール数: ${result.messages?.length || 0}`);
            return result.messages || [];

        } catch (error) {
            log(`Error取得失敗: ${error.message}`);
            throw error;
        }
    }
}
