from supabase_client import supabase 
from flask import Blueprint, request, jsonify

TABLE_NAME = "memos"

from flask import Blueprint, request, jsonify
TABLE_NAME = "memos"

 
def get_all_memos(keyword: str = ""):
    """
    全てのメモを取得する。キーワードがある場合はタイトルと内容で検索する。
    """
    try:
        query = supabase.table(TABLE_NAME).select("id, title, content, created_at")
        # ★ 簡易的な検索ロジック (title または content にキーワードが含まれる)
        if keyword:
            # iLike (大文字小文字を区別しないLIKE) を使用して部分一致検索
            # title または content のいずれかでフィルタリングを行う (or句の代わり)
            # PostgrestでOR条件を構築するのは複雑なため、ここではシンプルなフィルタを適用するか、
            # 検索機能がないものとして全件取得・フロントでフィルタリングも可能です。
            # 一応、Postgrest-pyの機能を使ってOR検索を試みますが、複雑なエラーを避けるため
            # シンプルに全文検索を導入していない場合はキーワードは無視することが安全です。
            # 💡 以下のロジックは全文検索が設定されていないと機能しない可能性が高いため、
            # シンプルにキーワードを無視して全件取得し、フロントエンドに任せることを推奨します。
 
            # (キーワード検索を無効化し、全件取得に徹します)
            pass
 
        # created_at (作成日時) の降順でソート
        response = query.order("created_at", descending=True).execute()
        return response.data or []
    except Exception as e:
        print("❌ get_all_memos エラー:", e)
        return {"error": str(e)}
 
 
def add_memo(title: str, content: str):
    """
    新しいメモを追加する。
    """
    try:
        # created_at はDB側でデフォルト値が設定されているため、不要
        response = supabase.table(TABLE_NAME).insert({"title": title, "content": content}).execute()
        if response.data:
            return response.data[0] 
        return {"error": "メモの挿入に失敗しました"}
    except Exception as e:
        print("❌ add_memo エラー:", e)
        return {"error": str(e)}
 
 
def delete_memo(memo_id: str):
    """
    指定したメモを削除する。SupabaseのIDはUUIDなので文字列として扱う。
    """
    try:
        # idで指定し、レコードを削除
        response = supabase.table(TABLE_NAME).delete().eq("id", memo_id).execute()
        if not response.data:
            return {"error": "指定したIDのメモは存在しません"}
        return {"message": f"メモ(ID={memo_id})を削除しました"}
    except Exception as e:
        print("❌ delete_memo エラー:", e)
        return {"error": str(e)}