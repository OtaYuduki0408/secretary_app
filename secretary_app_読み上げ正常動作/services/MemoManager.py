class MemoManager:
    def __init__(self):
        self.memos = [] # 仮のデータストア

    def add_memo(self, title: str, content: str):
        memo = {
            "id": f"memo_{len(self.memos) + 1}",
            "title": title,
            "content": content
        }
        self.memos.append(memo)
        print(f"Added memo: {memo}")
        return memo

    def search_memos(self, keyword: str = None, title: str = None):
        filtered_memos = []
        for memo in self.memos:
            match = True
            if keyword and keyword not in memo['title'] and keyword not in memo['content']:
                match = False
            if title and memo['title'] != title:
                match = False
            if match:
                filtered_memos.append(memo)
        print(f"Searched memos: {filtered_memos}")
        return filtered_memos
