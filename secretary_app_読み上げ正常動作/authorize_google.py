from services.google_oauth import build_installed_app_flow

# Google Calendar API のスコープ
SCOPES = ['https://www.googleapis.com/auth/calendar']


def main():
    flow = build_installed_app_flow(SCOPES)
    creds = flow.run_local_server(port=0)

    with open("token.json", "w", encoding="utf-8") as token:
        token.write(creds.to_json())

    print("✅ Google 認証が完了しました。token.json を保存しました。")


if __name__ == "__main__":
    main()
