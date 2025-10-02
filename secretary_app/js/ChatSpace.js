// Google Generative AI SDKをインポート
import { GoogleGenerativeAI } from 'https://cdn.jsdelivr.net/npm/@google/generative-ai@0.14.1/dist/index.mjs';
console.log("ChatSpace.jsがロードされました。")

// APIキーを直接記述 (本番環境では非推奨)
const apiKey = "AIzaSyCoyPKhnAhlZrekrnOyljxtl4zpo3hTEtc";

if (!apiKey) {
  console.error("APIキーが設定されていません",color="red")
  }

// APIクライアントを初期化
const genAI = new GoogleGenerativeAI(apiKey);

// 使用するモデルを指定
const model = genAI.getGenerativeModel({model: "gemini-2.5-flash"});


/**
*  チャットスペースに入力された内容を解析する関数
*  @param inputValue - 解析する内容
*/
export async function check_chat_Space(inputValue){
    console.log("フォームへの入力を検知しました。入力内容:"+inputValue)
    console.time("チャット解析処理、総所要時間")
    console.time("チャット解析処理、第一解析時間")

    //目的の特定
    let add_text = "以下のテキストの目的を分析し、対応する一文字のみで返答してください：T:時間、C:カレンダー（追加）、R:カレンダー（削除）、G:カレンダー（取得）、M:カレンダー（変更）、I:収入/支出、E:その他"
    const request_text = add_text + inputValue
    // 目的の関数を呼び出し
    let purpose = await gemini_request(request_text)
    console.timeEnd("チャット解析処理、第一解析時間")
    if(purpose == "T"){
      console.log("チャットの第一解析結果:時間取得関係(T)")
    }else if(purpose == "C"){
      console.log("チャットの第一解析結果:カレンダー追加(C)")
      add_calendar(inputValue)
    }else if(purpose == "R"){
      console.log("チャットの第一解析結果:カレンダー削除(R)")
    }else if(purpose == "G"){
      console.log("チャットの第一解析結果:カレンダー取得(G)")
    }else if(purpose == "M"){
      console.log("チャットの第一解析結果:カレンダー変更(M)")
    }else if(purpose == "I"){
      console.log("チャットの第一解析結果:収支管理(I)")
    }else{
      alert("このユーザーはその他の質問をしています。")
    }
  };

// Gemini APIにリクエストを送信し、結果をアラートで表示する
async function gemini_request(text) {
  console.info("gemini関数がテキストを受け取りました。")
  // トークンカウントの処理を修正
  try {
    // countTokensの引数を、APIリクエストと同様の contents 形式にする
    const token_response = await model.countTokens({contents: [{role: "user", parts: [{text: text}]}]});
    console.log("文章のトークン数:", token_response.totalTokens);
  } catch (e) {
    // トークンカウントのエラーは無視し、警告のみを表示
    console.warn("トークン数のカウントに失敗しました:", e);
  }
  console.time("geminiリクエスト、経過時間")
  try {
    // テキストを生成
    const result = await model.generateContent(text);
    const response = await result.response;
    const responce_text = response.text()
    console.log("gemini responce:",responce_text)
    console.timeEnd("geminiリクエスト、経過時間")
    return responce_text;
    
  } catch (error) {
    console.error('テキスト生成中にエラーが発生しました:', error);
    alert('テキスト生成中にエラーが発生しました。詳細はコンソールを確認してください。');
  }
}

/**
 * カレンダーに追加する処理を統括管理する関数
 * @param {string} text ユーザーによるテキスト
 */
async function add_calendar(text){
  console.time("チャット解析処理、第二解析時間：カレンダー追加")
  const now = new Date();
  let add_text = `
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
  alert("処理終了")
}