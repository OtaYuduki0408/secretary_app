class IncomeExpenseManager:
    def __init__(self):
        self.records = [] # 仮のデータストア

    def add_record(self, type: str, category: str, amount: float, date: str):
        record = {
            "id": f"ie_{len(self.records) + 1}",
            "type": type,
            "category": category,
            "amount": amount,
            "date": date
        }
        self.records.append(record)
        print(f"Added income/expense record: {record}")
        return record

    def list_records(self, start_date: str = None, end_date: str = None, category: str = None):
        filtered_records = []
        for record in self.records:
            match = True
            if start_date and record['date'] < start_date:
                match = False
            if end_date and record['date'] > end_date:
                match = False
            if category and record['category'] != category:
                match = False
            if match:
                filtered_records.append(record)
        print(f"Listed income/expense records: {filtered_records}")
        return filtered_records
