// Google Generative AI SDKをインポート
import { GoogleGenerativeAI } from 'https://cdn.jsdelivr.net/npm/@google/generative-ai@0.14.1/dist/index.mjs';

// APIキーを直接記述 (本番環境では非推奨)
const apiKey = "AIzaSyCoyPKhnAhlZrekrnOyljxtl4zpo3hTEtc";

if (!apiKey) {
  console.error("APIキーが設定されていません",color="red")
  }

// APIクライアントを初期化
const genAI = new GoogleGenerativeAI(apiKey);

// 使用するモデルを指定
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

console.log("ChatSpace.jsがロードされました。")

// テキストの入力を受け取る
document.addEventListener('DOMContentLoaded', function() {
  // フォーム要素を取得
  const form = document.getElementById('search');

  // フォームの送信イベントを監視
  form.addEventListener('submit',async function(event) {
    // フォームのデフォルトの送信動作を阻止
    event.preventDefault();
    // ID 'searchbox' を使って要素を直接取得します
    const inputElement = document.getElementById('searchbox'); 
    // inputElementがnullでないことを確認してからvalueを読み取ります（念のため）
    if (!inputElement) {
      console.error("ID 'searchbox' の要素が見つかりませんでした。");
      return; 
    }
    const inputValue = inputElement.value;

    console.log("フォームへの入力を検知しました。入力内容:"+inputValue)

    //目的の特定
    const add_text = "Analyze the purpose of the following text and reply with only the corresponding single letter: T:Time, C:Calendar, I:Income/Expense, E:Other."
    const request_text = add_text + inputValue
    // 目的の関数を呼び出し
    const purpose = await gemini_request(request_text)
    if(purpose == "T"){
      alert("このユーザーは時刻に関する質問をしています。")
    }else if(purpose == "C"){
      alert("このユーザーはカレンダーに関する質問をしています。")
    }else if(purpose == "I"){
      alert("このユーザーは収支管理に関する質問をしています。")
    }else{
      alert("このユーザーはその他の質問をしています。")
    }
    alert(purpose)
  });
});

// Gemini APIにリクエストを送信し、結果をアラートで表示する
async function gemini_request(text) {
  console.info("gemini関数がテキストを受け取りました。")
  try {
    // テキストを生成
    const result = await model.generateContent(text);
    const response = await result.response;
    const responce_text = response.text()
    console.log("gemini responce:",responce_text)
    return responce_text;
    
  } catch (error) {
    console.error('テキスト生成中にエラーが発生しました:', error);
    alert('テキスト生成中にエラーが発生しました。詳細はコンソールを確認してください。');
  }
}

