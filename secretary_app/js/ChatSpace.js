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
    const add_text = "Analyze the purpose of the following text and reply with only the corresponding single letter: T:Time, C:Calendar(Add), R:Calendar(Remove), G:Calendar(Get), M:Calendar(Change), I:Income/Expense, E:Other."
    const request_text = add_text + inputValue
    // 目的の関数を呼び出し
    const purpose = await gemini_request(request_text)
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
    console.timeEnd("チャット解析処理、総所要時間")
  };

// Gemini APIにリクエストを送信し、結果をアラートで表示する
async function gemini_request(text) {
  console.info("gemini関数がテキストを受け取りました。",text)
  console.log("文章のトークン数:",GenerativeModel.count_tokens(text))
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
function add_calendar(text){
}