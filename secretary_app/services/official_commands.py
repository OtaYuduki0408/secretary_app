OFFICIAL_COMMANDS = [
    {
        "name": "【公式設定】「今何時？」",
        "triggers": [
            {
                "category": "ボイス",
                "sub": "キーワード",
                "value": {
                    "keywords": [
                        [
                            "今何時"
                        ]
                    ]
                }
            }
        ],
        "steps": [
            {
                "kind": "action",
                "action": {
                    "category": "時間読み上げ",
                    "sub": "読み上げ内容",
                    "detail": {
                        "content": [
                            "今の時間"
                        ]
                    }
                }
            }
        ],
        "conditions": [],
        "actions": [
            {
                "category": "時間読み上げ",
                "sub": "読み上げ内容",
                "detail": {
                    "content": [
                        "今の時間"
                    ]
                }
            }
        ]
    },
    {
        "name": "【公式設定】「今日の天気を教えて」",
        "triggers": [
            {
                "category": "ボイス",
                "sub": "キーワード",
                "value": {
                    "keywords": [
                        [
                            "今日",
                            "天気",
                            "教えて"
                        ]
                    ]
                }
            }
        ],
        "steps": [
            {
                "kind": "action",
                "action": {
                    "category": "天気",
                    "sub": "読み上げ",
                    "detail": {
                        "content": [
                            "天気",
                            "気温"
                        ],
                        "range": "今日",
                        "granularity": "午前午後ごと"
                    }
                }
            }
        ],
        "conditions": [],
        "actions": [
            {
                "category": "天気",
                "sub": "読み上げ",
                "detail": {
                    "content": [
                        "天気",
                        "気温"
                    ],
                    "range": "今日",
                    "granularity": "午前午後ごと"
                }
            }
        ]
    },
    {
        "name": "【公式設定】「電気けして」",
        "triggers": [
            {
                "category": "ボイス",
                "sub": "キーワード",
                "value": {
                    "keywords": [
                        [
                            "電気",
                            "消して"
                        ],
                        [
                            "電気",
                            "けして"
                        ]
                    ]
                }
            }
        ],
        "steps": [
            {
                "kind": "action",
                "action": {
                    "category": "SwitchBot",
                    "sub": "デバイス操作",
                    "detail": {
                        "deviceId": "E13D0486756A",
                        "action": "turnOff"
                    }
                }
            }
        ],
        "conditions": [],
        "actions": [
            {
                "category": "SwitchBot",
                "sub": "デバイス操作",
                "detail": {
                    "deviceId": "E13D0486756A",
                    "action": "turnOff"
                }
            }
        ]
    },
    {
        "name": "【公式設定】「電気つけて」",
        "triggers": [
            {
                "category": "ボイス",
                "sub": "キーワード",
                "value": {
                    "keywords": [
                        [
                            "電気",
                            "つけて"
                        ],
                        [
                            "電気",
                            "付けて"
                        ]
                    ]
                }
            }
        ],
        "steps": [
            {
                "kind": "action",
                "action": {
                    "category": "SwitchBot",
                    "sub": "デバイス操作",
                    "detail": {
                        "deviceId": "E13D0486756A",
                        "action": "turnOn"
                    }
                }
            }
        ],
        "conditions": [],
        "actions": [
            {
                "category": "SwitchBot",
                "sub": "デバイス操作",
                "detail": {
                    "deviceId": "E13D0486756A",
                    "action": "turnOn"
                }
            }
        ]
    },
    {
        "name": "【公式設定】「今日の予定を教えて」",
        "triggers": [
            {
                "category": "ボイス",
                "sub": "キーワード",
                "value": {
                    "keywords": [
                        [
                            "今日",
                            "予定",
                            "教えて"
                        ]
                    ]
                }
            }
        ],
        "steps": [
            {
                "kind": "action",
                "action": {
                    "category": "カレンダー",
                    "sub": "読み上げ",
                    "detail": {
                        "start_year": "実行された年",
                        "start_month": "実行された月",
                        "start_day": "実行された日",
                        "start_time": "00:00",
                        "end_year": "実行された年",
                        "end_month": "実行された月",
                        "end_day": "実行された日",
                        "end_time": "23:59"
                    }
                }
            }
        ],
        "conditions": [],
        "actions": [
            {
                "category": "カレンダー",
                "sub": "読み上げ",
                "detail": {
                    "start_year": "実行された年",
                    "start_month": "実行された月",
                    "start_day": "実行された日",
                    "start_time": "00:00",
                    "end_year": "実行された年",
                    "end_month": "実行された月",
                    "end_day": "実行された日",
                    "end_time": "23:59"
                }
            }
        ]
    }
]