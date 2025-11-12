from google_auth_oauthlib.flow import InstalledAppFlow
import os
import json

# Google Calendar API のスコープ
SCOPES = ['https://www.googleapis.com/auth/calendar']

def main():
    creds = None

    # credentials.json の存在確認
    if not os.path.exists("credentials.json"):
        print("❌ credentials.json が見つかりません。Google Cloud Consoleからダウンロードしてください。")
        return

    # OAuth2 フローを開始
    flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
    creds = flow.run_local_server(port=0)

    # token.json に保存
    with open("token.json", "w") as token:
        token.write(creds.to_json())

    print("✅ Google 認証が完了しました！ token.json を保存しました。")

if __name__ == "__main__":
    main()
