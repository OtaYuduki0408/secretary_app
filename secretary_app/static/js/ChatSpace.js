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

  console.timeEnd("チャット解析処理 第一解析時間");

  // ==============================
  // 分岐処理
  // ==============================
  if (purpose == "C") {
    console.log("解析結果: カレンダー追加 (C)");
    fire('analysis:step', { index: 1, label: '目的判定' });
    await add_calendar(inputValue);
    fire('analysis:step', { index: 3, label: '結果反映' });

  } else if (purpose == "R") {
    console.log("解析結果: カレンダー削除 (R)");

  } else if (purpose == "G") {
    console.log("解析結果: カレンダー取得 (G)");

  } else if (purpose == "M") {
    console.log("解析結果: カレンダー変更 (M)");

  } else if (purpose == "I") {
    console.log("解析結果: 収支管理 (I)");

  } else {
    alert("このユーザーはその他の質問をしています。");
  }

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
  const request_text = add_text + text;
  const purpose = await gemini_request(request_text);
  console.log("第二解析(カレンダー追加処理)結果:", purpose);
  console.timeEnd("チャット解析処理 第二解析時間：カレンダー追加");
  console.timeEnd("チャット解析処理 総所要時間");
}

// ==============================
// インジケーターイベント
// ==============================
function fire(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
