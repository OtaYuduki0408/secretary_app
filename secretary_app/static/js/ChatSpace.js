// ==============================
// Google Generative AI SDK
// ==============================
import { GoogleGenerativeAI } from 'https://cdn.jsdelivr.net/npm/@google/generative-ai@0.14.1/dist/index.mjs';
console.log("✅ ChatSpace.js ロード完了");

const apiKey = "AIzaSyCoyPKhnAhlZrekrnOyljxtl4zpo3hTEtc";
if (!apiKey) console.error("APIキーが設定されていません");

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ==============================
// 解析メイン関数（唯一の定義）
// ==============================
export async function check_chat_Space(inputValue) {
  fire('analysis:start', { steps: ['目的判定', '詳細抽出', '結果反映'] });

  console.log("フォームへの入力を検知しました。入力内容:", inputValue);
  console.time("チャット解析処理 総所要時間");
  console.time("チャット解析処理 第一解析時間");

  // 目的分類
  const add_text = "以下のテキストの目的を分析し、対応する一文字のみで返答してください：C:カレンダー（追加）、R:カレンダー（削除）、G:カレンダー（取得）、M:カレンダー（変更）、I:収入/支出、E:その他";
  const request_text = add_text + inputValue;
  const purpose = await gemini_request(request_text);
  fire('analysis:step', { index: 1, label: '目的判定' });

  console.timeEnd("チャット解析処理 第一解析時間");

  // ==============================
  // 分岐処理
  // ==============================
  if (purpose == "C") {
    console.log("解析結果: カレンダー追加 (C)");
    await add_calendar(inputValue);

  } else if (purpose == "R") {
    console.log("解析結果: カレンダー削除 (R)");
    await remove_calendar(inputValue)

  } else if (purpose == "G") {
    console.log("解析結果: カレンダー取得 (G)");
    await get_calender(inputValue)

  } else if (purpose == "M") {
    console.log("解析結果: カレンダー変更 (M)");
    await change_calendar(inputValue)

  } else if (purpose == "I") {
    await console.log("解析結果: 収支管理 (I)");

  } 
  fire('analysis:step', { index: 3, label: '結果反映' });

  console.timeEnd("チャット解析処理 総所要時間");
  fire('analysis:end');
}

// ==============================
// Gemini API 呼び出し
// ==============================
async function gemini_request(text) {
  console.info("gemini_request 呼び出し:", text);
  try {
    const token_response = await model.countTokens({
      contents: [{ role: "user", parts: [{ text }] }]
    });
    console.log("トークン数:", token_response.totalTokens);
  } catch (e) {
    console.warn("トークン数のカウントに失敗:", e);
  }

  console.time("geminiリクエスト 経過時間");
  try {
    const result = await model.generateContent(text);
    const response = await result.response;
    const response_text = response.text();
    console.log("gemini response:", response_text);
    console.timeEnd("geminiリクエスト 経過時間");
    return response_text;
  } catch (error) {
    console.error('テキスト生成中にエラーが発生しました:', error);
    alert('テキスト生成中にエラーが発生しました。詳細はコンソールを確認してください。');
  }
}

// ==============================
// カレンダー追加処理
// ==============================
async function add_calendar(text) {
  console.time("チャット解析処理 第二解析時間：カレンダー追加");
  const now = new Date();
  const add_text = `
  目標: カレンダー予定抽出
  意図: 予定追加
  抽出必須項目:
  - name（予定名）
  - start_time（未指定時は当日/推測時刻）
  - end_time（未指定時は開始1H後）
  timeはYYYY-MM-DD HH:MM:SS
  出力はJSON配列のみ、他テキスト禁止。複数予定時はリスト化。
  現在時刻は${now}
  `;
  const request_text = add_text + text
  // 目的の関数を呼び出し
  let purpose = await gemini_request(request_text)
  console.log("第二解析(カレンダー追加処理)結果：",purpose)
  console.timeEnd("チャット解析処理、第二解析時間：カレンダー追加")
  console.timeEnd("チャット解析処理、総所要時間")
}

async function get_calender(text) {
  console.time("チャット解析処理、第二解析時間：カレンダー取得")
  const now = new Date();
  let add_text = `
  目標: ユーザーはカレンダーのstart_timeからend_timeまでに存在する全ての予定を把握しようとしています。start_timeとend_timeを特定してください。削除を求めらえている場合は、削除に必要な情報収集が目的です。ある程度広い範囲(1日程度)を指定してください。
  抽出必須項目:
  - start_time（未指定時は当日/推測時刻）
  - end_time（未指定時は開始1日後）
  timeはYYYY-MM-DD HH:MM:SS
  出力はJSON配列のみ、他テキスト禁止。
  現在時刻は${now}
  `;
  const request_text = add_text + text
  // 目的の関数を呼び出し
  let purpose = await gemini_request(request_text)
  console.log("第二解析(カレンダー取得処理)結果：",purpose)
  console.timeEnd("チャット解析処理、第二解析時間：カレンダー取得")
  console.timeEnd("チャット解析処理、総所要時間")
  return purpose
}

async function remove_calendar(text) {
  let task_list = await get_calender(text);
  task_list = [
  {
    "name": "起床",
    "start_time": "2025-10-21 06:10:00",
    "end_time": "2025-10-21 06:20:00"
  },
  {
    "name": "身支度・朝の準備",
    "start_time": "2025-10-21 06:20:00",
    "end_time": "2025-10-21 07:00:00"
  },
  {
    "name": "朝食",
    "start_time": "2025-10-21 07:00:00",
    "end_time": "2025-10-21 07:30:00"
  },
  {
    "name": "出勤・登校準備/出発",
    "start_time": "2025-10-21 07:30:00",
    "end_time": "2025-10-21 08:30:00"
  },
  {
    "name": "午前中の作業/活動",
    "start_time": "2025-10-21 09:00:00",
    "end_time": "2025-10-21 12:00:00"
  },
  {
    "name": "昼食・休憩",
    "start_time": "2025-10-21 12:00:00",
    "end_time": "2025-10-21 13:00:00"
  },
  {
    "name": "午後の作業/活動",
    "start_time": "2025-10-21 13:00:00",
    "end_time": "2025-10-21 18:00:00"
  },
  {
    "name": "帰宅・夕食の準備",
    "start_time": "2025-10-21 18:00:00",
    "end_time": "2025-10-21 19:00:00"
  },
  {
    "name": "夕食",
    "start_time": "2025-10-21 19:00:00",
    "end_time": "2025-10-21 20:00:00"
  },
  {
    "name": "自由時間・リラックス",
    "start_time": "2025-10-21 20:00:00",
    "end_time": "2025-10-21 22:00:00"
  },
  {
    "name": "就寝準備",
    "start_time": "2025-10-21 22:00:00",
    "end_time": "2025-10-21 23:00:00"
  },
  {
    "name": "就寝",
    "start_time": "2025-10-21 23:00:00",
    "end_time": "2025-10-21 24:00:00"
  }
]
  console.time("チャット解析処理、第三解析時間：カレンダー削除")
  const now = new Date();
  let add_text = `
  目標: ユーザーはカレンダーから予定を削除しようとしています。以下の「予定一覧」から、ユーザーが削除しようとしている予定を抽出してください。
  抽出必須項目:
  - name（予定名）
  - start_time（未指定時は当日/推測時刻）
  - end_time（未指定時は開始1日後）
  timeはYYYY-MM-DD HH:MM:SS
  出力はJSON配列のみ、他テキスト禁止。
  現在時刻は${now}
  予定一覧:${task_list}
  `;
  const request_text = add_text + text
  // 目的の関数を呼び出し
  let purpose = await gemini_request(request_text)
  console.log("第三解析(カレンダー削除処理)結果：",purpose)
  console.timeEnd("チャット解析処理、第三解析時間：カレンダー削除")
  console.timeEnd("チャット解析処理、総所要時間")
}

async function change_calendar(text) {
  let task_list = await get_calender(text);
  task_list = `[
    {
      "name": "起床",
      "start_time": "2025-10-15 06:10:00",
      "end_time": "2025-10-15 06:20:00"
    },
    {
      "name": "身支度・朝の準備",
      "start_time": "2025-10-15 06:20:00",
      "end_time": "2025-10-15 07:00:00"
    },
    {
      "name": "朝食",
      "start_time": "2025-10-15 07:00:00",
      "end_time": "2025-10-15 07:30:00"
    },
    {
      "name": "出勤・登校準備/出発",
      "start_time": "2025-10-15 07:30:00",
      "end_time": "2025-10-15 08:30:00"
    },
    {
      "name": "午前中の作業/活動",
      "start_time": "2025-10-15 09:00:00",
      "end_time": "2025-10-15 12:00:00"
    },
    {
      "name": "昼食・休憩",
      "start_time": "2025-10-15 12:00:00",
      "end_time": "2025-10-15 13:00:00"
    },
    {
      "name": "午後の作業/活動",
      "start_time": "2025-10-15 13:00:00",
      "end_time": "2025-10-15 18:00:00"
    },
    {
      "name": "帰宅・夕食の準備",
      "start_time": "2025-10-15 18:00:00",
      "end_time": "2025-10-15 19:00:00"
    },
    {
      "name": "夕食",
      "start_time": "2025-10-15 19:00:00",
      "end_time": "2025-10-15 20:00:00"
    },
    {
      "name": "自由時間・リラックス",
      "start_time": "2025-10-15 20:00:00",
      "end_time": "2025-10-15 22:00:00"
    },
    {
      "name": "就寝準備",
      "start_time": "2025-10-15 22:00:00",
      "end_time": "2025-10-15 23:00:00"
    },
    {
      "name": "就寝",
      "start_time": "2025-10-15 23:00:00",
      "end_time": "2025-10-15 24:00:00"
    }
  ]`
  console.time("チャット解析処理、第三解析時間：カレンダー変更")
  const now = new Date();
  let add_text = `
  目標: ユーザーはカレンダーから予定を変更しようとしています。以下の「予定一覧」から、ユーザーが変更しようとしている予定を抽出してください。
  抽出必須項目:
  - before_name（変更前の予定名）
  - before_start_time（未指定時は当日/推測時刻）
  - before_end_time（未指定時は開始1日後）
  - after_name (変更後の予定名)
  - after_start_time 
  - after_end_time
  timeはYYYY-MM-DD HH:MM:SS
  出力はJSON配列のみ、他テキスト禁止。
  現在時刻は${now}
  予定一覧:${task_list}
  `;
  const request_text = add_text + text
  // 目的の関数を呼び出し
  let purpose = await gemini_request(request_text)
  console.log("第三解析(カレンダー変更処理)結果：",purpose)
  console.timeEnd("チャット解析処理、第三解析時間：カレンダー変更")
  console.timeEnd("チャット解析処理、総所要時間")
}

// ==============================
// インジケーターイベント
// ==============================
function fire(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}