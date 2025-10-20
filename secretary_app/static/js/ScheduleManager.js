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
}
