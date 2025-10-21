const clientId = "964406409299-dd8g3vumtmeuaht9tmq9f5l21otetfn7.apps.googleusercontent.com";
const apiKey = "AIzaSyDUqgdhLHjWeTqrwYLr2LItsU3C7GYYCDI";
const redirectUri = "https://127.0.0.1:5000/oauth-callback";

class ScheduleManager {
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

    async addEvent(title, description, start, end, log) {
        if (!this.accessToken) return alert("Google認証を行ってください。");
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
        if (!this.accessToken) return alert("Google認証を行ってください。");
        await gapi.client.load("calendar", "v3");
        await gapi.client.calendar.events.delete({
            calendarId: "primary",
            eventId: eventId,
        });
        log(`イベント削除: ${eventId}`);
    }

    async listEvents(start, end, log) {
        if (!this.accessToken) return alert("Google認証を行ってください。");
        await gapi.client.load("calendar", "v3");

        const startDate = new Date(start).toISOString();
        const endDate = new Date(end).toISOString();

        const response = await gapi.client.calendar.events.list({
            calendarId: "primary",
            timeMin: startDate,
            timeMax: endDate,
            singleEvents: true,
            orderBy: "startTime",
        });

        const events = response.result.items;
        if (!events.length) {
            log("該当期間にイベントはありません。");
        } else {
            log(`=== ${events.length} 件のイベント ===`);
            events.forEach(ev => {
                const start = ev.start.dateTime || ev.start.date;
                log(`📅 ${start} : ${ev.summary} [${ev.id}]`);
            });
        }
    }
}
