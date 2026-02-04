import { addConditionBlock, addAction } from './block_operations.js';
import { populateSelect, updateSubOptions } from './ui_helpers.js';
import { createTriggerUI, saveAddressToDB } from './trigger_ui.js';
import { createActionUI } from './action_ui.js'; // createActionUI も必要
import { TRIGGER_CATEGORIES, TRIGGER_CATEGORIES_MAIN, ACTION_CATEGORIES } from './constants.js';

function getAdvancedDateRangeValues(container) {
    if (!container) return {};
    const getVal = (selector) => container.querySelector(selector)?.value || '';
    return {
        start_year: getVal('[id$="start_year"]'),
        start_month: getVal('[id$="start_month"]'),
        start_day: getVal('[id$="start_day"]'),
        start_time: getVal('[id$="start_time"]'),
        end_year: getVal('[id$="end_year"]'),
        end_month: getVal('[id$="end_month"]'),
        end_day: getVal('[id$="end_day"]'),
        end_time: getVal('[id$="end_time"]'),
    };
}

export function parseActionArray(actionRoot) {
  if (!actionRoot) return [];
  const allActionItems = [...actionRoot.children].filter(child => child.classList.contains('item'));
  
  const actions = [...allActionItems].map(actionItem => parseActionItem(actionItem));
  console.log("[DEBUG] parseActionArray:", actions);
  return actions;
}

export function parseConditions(root){
  if (!root) return [];
  const conditions = [...root.children]
    .filter(child => child.classList.contains('condition-block'))
    .map(block => parseConditionBlock(block));
  console.log("[DEBUG] parseConditions:", conditions);
  return conditions;
}

function parseActionItem(actionItem) {
  const category = actionItem.querySelector(".action-category").value;
  const subSelect = actionItem.querySelector(".action-sub");
  let sub = subSelect?.value || "";
  if (!sub && subSelect?.options?.length) {
    sub = subSelect.options[0].value;
  }
  
  let detail = {};
  const detailContainer = actionItem.querySelector(".action-detail-container");

  switch (category) {
    case "カレンダー":
      if (sub === "追加") {
        detail.title = detailContainer.querySelector(".action-detail-cal-title")?.value;
        detail.description = detailContainer.querySelector(".action-detail-cal-description")?.value;
        Object.assign(detail, getAdvancedDateRangeValues(detailContainer));
      } else if (sub === "削除") {
        detail.title = detailContainer.querySelector(".action-detail-cal-title")?.value;
        Object.assign(detail, getAdvancedDateRangeValues(detailContainer));
      } else if (sub === "読み上げ") {
        Object.assign(detail, getAdvancedDateRangeValues(detailContainer));
      }
      break;
    case "収支管理":
      if (sub === "読み上げ") {
        detail.item = detailContainer.querySelector(".action-detail-fin-read-item")?.value;
        detail.format = detailContainer.querySelector(".action-detail-fin-read-format")?.value;
        Object.assign(detail, getAdvancedDateRangeValues(detailContainer));
      }
      break;
    case "メモ":
      if (sub === "読み上げ") {
        detail.title = detailContainer.querySelector('.action-detail-memo-title')?.value;
        detail.word = detailContainer.querySelector('.action-detail-memo-word')?.value;
        Object.assign(detail, getAdvancedDateRangeValues(detailContainer));
      }
      break;
    case "SwitchBot":
      if (sub === "デバイス操作") {
        detail.deviceId = detailContainer.querySelector('.action-detail-switchbot-device')?.value;
        detail.action = detailContainer.querySelector('.action-detail-switchbot-action')?.value;
      }
      break;
    case "発声":
      if (sub === "実行") {
        detail.text = detailContainer.querySelector(".action-detail-speak-text")?.value;
      }
      break;
    case "時間読み上げ":
      if (sub === "読み上げ内容") {
        detail.content = [...detailContainer.querySelectorAll('.action-detail-time-read-content button.selected')].map(btn => btn.dataset.value);
      }
      break;
    case "アラート":
      if (sub === "実行") {
        detail.sound = detailContainer.querySelector(".action-detail-alert-sound")?.value;
      }
      break;

    // 新しく追加する case "天気":
    case "天気":
      if (sub === "読み上げ") {
        detail.content = [...detailContainer.querySelectorAll('.action-detail-weather-content button.selected')].map(btn => btn.dataset.value);
        detail.range = detailContainer.querySelector('.action-detail-weather-range button.selected')?.dataset.value;
        detail.granularity = detailContainer.querySelector('.action-detail-weather-granularity button.selected')?.dataset.value;
      }
      break;
  }

  const actionData = { category, sub, detail };
  console.log("[DEBUG] parseActionItem:", actionData);

  return actionData;
}

function parseConditionBlock(block) {
  const type = block.querySelector(".condition-type").value;
  let expr = null;

  if (type === 'if') {
    const container = block.querySelector('.condition-expr-container');
    const prefix = block.id + '_';
    
    const categorySelect = document.getElementById(`${prefix}trigger_category`);
    const subSelect = document.getElementById(`${prefix}trigger_sub`);
    
    if (categorySelect) {
      const category = categorySelect.value;
      const sub = subSelect.value;
      const valueContainer = document.getElementById(`${prefix}trigger_value_container`);
      let value = {};

      if (valueContainer) {
          switch (category) {
            case "場所":
              value.address = valueContainer.querySelector(`[id$="trigger_value_address"]`)?.value;
              value.latitude = valueContainer.querySelector(`[id$="trigger_value_latitude"]`)?.value;
              value.longitude = valueContainer.querySelector(`[id$="trigger_value_longitude"]`)?.value;
              value.range = valueContainer.querySelector(`[id$="trigger_value_range"]`)?.value;
              break;
            case "カレンダー":
                Object.assign(value, getAdvancedDateRangeValues(valueContainer));
                value.title = valueContainer.querySelector(`[id$="trigger_value_cal_title"]`)?.value;
              break;
            case "収支管理":
                value.item = valueContainer.querySelector(`[id$="finance_item"]`)?.value;
                value.compare = valueContainer.querySelector(`[id$="finance_compare"]`)?.value;
                value.amount = valueContainer.querySelector(`[id$="finance_amount"]`)?.value;
                value.genres = [...valueContainer.querySelectorAll(`#${prefix}finance_genres button.selected`)].map(btn => btn.dataset.value);
                Object.assign(value, getAdvancedDateRangeValues(valueContainer));
              break;
            case "メモ":
                value.scope = valueContainer.querySelector(`[id$="memo_scope"]`)?.value;
                value.content = valueContainer.querySelector(`[id$="memo_content"]`)?.value;
                value.priority = valueContainer.querySelector(`[id$="memo_priority"]`)?.value;
                Object.assign(value, getAdvancedDateRangeValues(valueContainer));
              break;
            case "時間":
                Object.assign(value, getAdvancedDateRangeValues(valueContainer));
              break;
            case "SwitchBot":
                if (sub === "人感センサー") {
                    value.detection = valueContainer.querySelector(`[id$="switchbot_detection"]`)?.value;
                    value.light = valueContainer.querySelector(`[id$="switchbot_light"]`)?.value;
                }
              break;
            default:
              value.value = valueContainer.querySelector(`[id$="trigger_value"]`)?.value;
              break;
          }
      }

      expr = {
        category: category,
        sub: sub,
        value: value
      };
    }
  }

  const conditionData = {
    logic: block.querySelector(".condition-logic").value,
    type: type,
    expr: expr,
    nested: parseConditions(block.querySelector(".nested-conditions")),
    actions: parseActionArray(block.querySelector(".nested-actions"))
  };
  console.log("[DEBUG] parseConditionBlock:", conditionData);
  return conditionData;
}

function parseSteps(root) {
  if (!root) return [];
  const steps = [...root.children]
    .filter(child => child.classList.contains('condition-block') || child.classList.contains('item'))
    .map(child => {
      if (child.classList.contains('condition-block')) {
        return { kind: 'condition', condition: parseConditionBlock(child) };
      }
      return { kind: 'action', action: parseActionItem(child) };
    });
  console.log("[DEBUG] parseSteps:", steps);
  return steps;
}
export function loadCommandToForm(cmd){
  console.log("--- [DEBUG] loadCommandToForm called with cmd:", cmd);
  // フォームをリセット
  document.getElementById("name").value = "";
  document.getElementById("trigger_category").value = "";
  document.getElementById("trigger_sub").innerHTML = "<option value=''>選択してください</option>";
  document.getElementById("trigger_value_container").innerHTML = '<input type="text" id="trigger_value" placeholder="値">';
  document.getElementById("condition_blocks").innerHTML = "";
  document.getElementById("command-id")?.remove();


  // データをフォームに設定
  document.getElementById("name").value = cmd.name;
  
  // Triggerの復元
  if (cmd.triggers && cmd.triggers.length > 0) {
    const trigger = cmd.triggers[0];
    const triggerCategorySelect = document.getElementById("trigger_category");
    const triggerSubSelect = document.getElementById("trigger_sub");

    triggerCategorySelect.value = trigger.category || "";
    
    updateSubOptions(triggerCategorySelect.id, triggerSubSelect.id, TRIGGER_CATEGORIES_MAIN);
    
    if (trigger.sub) {
      triggerSubSelect.value = trigger.sub;
    } else if (TRIGGER_CATEGORIES_MAIN[trigger.category]?.length) {
      triggerSubSelect.value = TRIGGER_CATEGORIES_MAIN[trigger.category][0];
    } else {
      triggerSubSelect.value = "";
    }

    setTimeout(() => {
        createTriggerUI('', trigger.value);
    }, 0);
  }

  // 条件ブロックとトップレベルアクションの復元
  const conditionBlocksContainer = document.getElementById("condition_blocks");
  conditionBlocksContainer.innerHTML = "";

  const steps = Array.isArray(cmd.steps) ? cmd.steps : [];
  if (steps.length > 0) {
    steps.forEach(step => {
      if (!step) return;
      if (step.kind === 'condition') {
        addConditionBlockFromData(step.condition || {}, conditionBlocksContainer);
        return;
      }
      if (step.kind === 'action') {
        addAction(conditionBlocksContainer, step.action || {});
        return;
      }
      if (step.condition) {
        addConditionBlockFromData(step.condition, conditionBlocksContainer);
        return;
      }
      if (step.action) {
        addAction(conditionBlocksContainer, step.action);
        return;
      }
      if (step.type === 'if' || step.type === 'else' || step.expr) {
        addConditionBlockFromData(step, conditionBlocksContainer);
        return;
      }
      if (step.category) {
        addAction(conditionBlocksContainer, step);
      }
    });
  } else {
    (cmd.conditions || []).forEach(c => addConditionBlockFromData(c, conditionBlocksContainer));
    (cmd.actions || []).forEach(a => addAction(conditionBlocksContainer, a));
  }


  document.getElementById("command-id")?.remove();
  const hid=document.createElement("input"); hid.type="hidden"; hid.id="command-id"; hid.value=cmd.id;
  document.getElementById("register-btn").parentNode.appendChild(hid);
}

export function addConditionBlockFromData(data,parent){
  addConditionBlock(parent, data);
  const b=parent.lastElementChild;
  if(data.nested?.length) data.nested.forEach(n=>addConditionBlockFromData(n,b.querySelector(".nested-conditions")));
  if(data.actions?.length) data.actions.forEach(a=>addAction(b.querySelector(".nested-actions"),a));
}

export async function registerCommand(){
  console.log("--- [DEBUG] registerCommand called ---");
  const id=document.getElementById("command-id")?.value||null;
  
  // バリデーション: 命令名が空の場合はアラートを出して処理を中断
  const commandName = document.getElementById("name").value;
  if (!commandName || !commandName.trim()) {
    alert("命令名を入力してください。");
    return;
  }

  // Trigger
  const triggerCategory = document.getElementById("trigger_category").value;
  let triggerSub = document.getElementById("trigger_sub").value;
  if (!triggerSub && TRIGGER_CATEGORIES_MAIN[triggerCategory]?.length) {
    triggerSub = TRIGGER_CATEGORIES_MAIN[triggerCategory][0];
    const triggerSubSelect = document.getElementById("trigger_sub");
    if (triggerSubSelect) {
      triggerSubSelect.value = triggerSub;
    }
  }
  let triggerValue = {};
  const triggerContainer = document.getElementById("trigger_value_container");

  // Triggerのデータ収集ロジック
  switch (triggerCategory) {
    case "場所":
      triggerValue.address = triggerContainer.querySelector("#trigger_value_address")?.value;
      triggerValue.latitude = triggerContainer.querySelector("#trigger_value_latitude")?.value;
      triggerValue.longitude = triggerContainer.querySelector("#trigger_value_longitude")?.value;
      triggerValue.range = triggerContainer.querySelector("#trigger_value_range")?.value;

      // 住所が入力されている場合、DBに保存
      if (triggerValue.address) {
        await saveAddressToDB(triggerValue.address);
      }
      break;
    case "カレンダー":
      if (triggerSub === "入力があったら") {
        triggerValue.actions = [...triggerContainer.querySelectorAll("#trigger_value_calendar_actions button.selected")].map(btn => btn.dataset.value);
        triggerValue.filters = [...triggerContainer.querySelectorAll(".filter-item")].map(item => ({
          text: item.querySelector(".calendar_filter_text")?.value,
          logic: item.querySelector(".calendar_filter_logic")?.value
        }));
      } else if (triggerSub === "予定の時間になったら") {
        triggerValue.title = triggerContainer.querySelector("#trigger_value_cal_title")?.value;
        // 以下はIDを修正する必要がある可能性があります。元のcreateTriggerUIのid生成ロジックを確認してください。
        triggerValue.start_year = triggerContainer.querySelector("#trigger_value_cal_start_year")?.value;
        triggerValue.start_month = triggerContainer.querySelector("#trigger_value_cal_start_month")?.value;
        triggerValue.start_day = triggerContainer.querySelector("#trigger_value_cal_start_day")?.value;
        triggerValue.day_of_week = [...triggerContainer.querySelectorAll("#trigger_value_cal_day_of_week_buttons button.selected")].map(btn => btn.dataset.value);
        triggerValue.start_time = triggerContainer.querySelector("#trigger_value_cal_start_time")?.value;
        triggerValue.end_year = triggerContainer.querySelector("#trigger_value_cal_end_year")?.value;
        triggerValue.end_month = triggerContainer.querySelector("#trigger_value_cal_end_month")?.value;
        triggerValue.end_day = triggerContainer.querySelector("#trigger_value_cal_end_day")?.value;
        triggerValue.end_time = triggerContainer.querySelector("#trigger_value_cal_end_time")?.value;
      }
      break;
    case "収支管理":
      if (triggerSub === "入力があったら") {
        triggerValue.actions = [...triggerContainer.querySelectorAll(`#trigger_value_finance_actions button.selected`)].map(btn => btn.dataset.value);
        if (triggerValue.actions.includes('追加')) {
          triggerValue.genres = [...triggerContainer.querySelectorAll(`#trigger_value_finance_genres button.selected`)].map(btn => btn.dataset.value);
        }
      } else if (triggerSub === "特定金額になったら") {
        triggerValue.item = triggerContainer.querySelector("#trigger_value_finance_item")?.value;
        triggerValue.compare = triggerContainer.querySelector("#trigger_value_finance_compare")?.value;
        triggerValue.amount = triggerContainer.querySelector("#trigger_value_finance_amount")?.value;
        triggerValue.percentage = triggerContainer.querySelector("#trigger_value_finance_percentage")?.value;
      }
      break;
    case "メモ":
      if (triggerSub === "入力があったら") {
        triggerValue.actions = [...triggerContainer.querySelectorAll(`#trigger_value_memo_actions button.selected`)].map(btn => btn.dataset.value);
        triggerValue.filters = [...triggerContainer.querySelectorAll(".filter-item")].map(item => ({
          text: item.querySelector(".memo_filter_text")?.value,
          logic: item.querySelector(".memo_filter_logic")?.value
        }));
      }
      break;
    case "時間":
      // `prefix` がない場合はメインのトリガー設定なので、特定時間UIから値を取得
      triggerValue.year = triggerContainer.querySelector("#trigger_value_year")?.value;
      triggerValue.month = triggerContainer.querySelector("#trigger_value_month")?.value;
      triggerValue.day = triggerContainer.querySelector("#trigger_value_day")?.value;
      triggerValue.day_of_week = [...triggerContainer.querySelectorAll("#trigger_value_day_of_week_buttons button.selected")].map(btn => btn.dataset.value);
      triggerValue.time = triggerContainer.querySelector("#trigger_value_time")?.value;
      break;
    case "ボイス":
      const keywordInputs = triggerContainer.querySelectorAll('.voice-keyword-input');
      const keywords = [];
      keywordInputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
          // カンマで区切ってAND条件の配列を作成
          const andKeywords = value.split(',').map(k => k.trim()).filter(k => k);
          if (andKeywords.length > 0) {
            keywords.push(andKeywords);
          }
        }
      });
      // 最終的に [['keyword1', 'keyword2'], ['keyword3']] のような形式になる
      triggerValue.keywords = keywords;
      break;
    case "SwitchBot":
      triggerValue.device_id = triggerContainer.querySelector("#trigger_value_switchbot_device_select")?.value;
      triggerValue.brightness_condition = triggerContainer.querySelector("#trigger_value_switchbot_brightness")?.value;
      triggerValue.motion_condition = triggerContainer.querySelector("#trigger_value_switchbot_motion")?.value;
      break;
    default:
      triggerValue.value = triggerContainer.querySelector("#trigger_value")?.value;
      break;
  }

  const topLevelBlocks = document.getElementById("condition_blocks");

  const payload={
    name:document.getElementById("name").value,
    triggers:[{
      category: triggerCategory,
      sub: triggerSub,
      value: triggerValue
    }],
    steps: parseSteps(topLevelBlocks),
    conditions: parseConditions(topLevelBlocks),
    actions: parseActionArray(topLevelBlocks)
  };
  console.log("--- [DEBUG] Payload to be sent:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(id ? `/api/custom_orders/${id}` : "/api/custom_orders", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("--- [DEBUG] Fetch response status:", res.status);
    const data = await res.json();
    console.log("--- [DEBUG] Fetch response data:", data);

    document.getElementById("message").innerText = data.message || "保存しました";
    setTimeout(() => document.getElementById("message").innerText = "", 3000);
    document.getElementById("command-id")?.remove();
    loadCommands();
  } catch (error) {
    console.error("--- [ERROR] Fetch failed:", error);
    document.getElementById("message").innerText = "エラーが発生しました。コンソールを確認してください。";
  }
}

export async function fetchGenres() {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) {
      console.error('Failed to fetch genres:', response.statusText);
      return [];
    }
    const genres = await response.json();
    return genres;
  } catch (error) {
    console.error('Error fetching genres:', error);
    return [];
  }
}

export async function loadCommands() {
  console.log("--- [DEBUG] loadCommands called ---");
  try {
    const res = await fetch("/api/custom_orders");
    console.log("--- [DEBUG] loadCommands fetch response status:", res.status);
    if (!res.ok) {
      console.error("--- [ERROR] Fetch failed with status:", res.status);
      const errorText = await res.text();
      console.error("--- [ERROR] Fetch error response text:", errorText);
      document.getElementById("command-list").innerHTML = `<p style="color:red;">一覧の読み込みに失敗しました。</p>`;
      return;
    }
    const list = await res.json();
    console.log("--- [DEBUG] loadCommands received list:", list);

    const container = document.getElementById("command-list");
    container.innerHTML = "";
    if (!list || !list.length) {
      container.innerHTML = "<p>登録された命令はありません。</p>";
      return;
    }
    list.forEach(cmd => {
      const div = document.createElement("div");
      div.className = "item";
      // nameプロパティが存在しない場合も考慮
      div.innerHTML = `<b>${cmd.name || '名前なし'}</b> (ID:${cmd.id})`;
      const editBtn = document.createElement("button");
      editBtn.className = "nest-button";
      editBtn.innerText = "編集";
      editBtn.onclick = () => loadCommandToForm(cmd);
      const delBtn = document.createElement("button");
      delBtn.className = "remove";
      delBtn.innerText = "削除";
      delBtn.onclick = async () => {
        if (confirm("削除しますか？")) {
          await fetch(`/api/custom_orders/${cmd.id}`, {
            method: "DELETE"
          });
          loadCommands();
        }
      };
      div.appendChild(editBtn);
      div.appendChild(delBtn);
      container.appendChild(div);
    });
  } catch (error) {
    console.error("--- [ERROR] loadCommands failed:", error);
    document.getElementById("command-list").innerHTML = `<p style="color:red;">一覧の読み込み中にエラーが発生しました。</p>`;
  }
}

// ★仮のユーザーID。実際にはサーバーから取得するか、セッションから取得する
// TODO: ユーザー認証後に、サーバーから安全にユーザーIDをフロントエンドに渡す仕組みが必要
const TEMP_USER_ID_FOR_POLLING = "593bc6a3-1894-47ed-9833-9ac270f84aa0"; // あなたのSupabaseユーザーのIDに置き換えてください

export async function pollPendingActions() {
  console.log("--- DEBUG: pollPendingActions called ---");
  const userId = TEMP_USER_ID_FOR_POLLING; 

  if (!userId || userId === "user123") {
    console.warn("User ID not available for polling pending actions. Skipping poll. (Current ID is 'user123' or empty)");
    // return; // デバッグ目的でコメントアウト
  }

  try {
    const response = await fetch("/order/api/pending_actions/" + userId);
    console.log("--- DEBUG: pollPendingActions fetch response status:", response.status); // 追加
    if (!response.ok) {
      console.error("Failed to poll pending actions: " + response.status + " " + response.statusText);
      return;
    }
    const actions = await response.json();
    console.log("--- DEBUG: pollPendingActions received actions:", actions); // 追加
    if (actions && actions.length > 0) {
      console.log("RECEIVED PENDING ACTIONS:", actions);
      actions.forEach(action => {
        console.log("--- DEBUG: Processing action:", action); // 追加
        const actionData = action.action_data;
        const executionResult = action.execution_result; // ActionExecutorからの実行結果
        let message = "アクション受信: " + actionData.category + ":" + actionData.sub;
        if (actionData.category === '発声' && actionData.sub === '実行') {
          // 発声アクションの場合、ブラウザの音声合成機能を使う
          const textToSpeak = actionData.detail.text;
          if (textToSpeak) {
            console.log("音声合成: " + textToSpeak);
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            speechSynthesis.speak(utterance);
            message += " -> " + textToSpeak;
                      }
                    } else if (actionData.category === '天気' && actionData.sub === '読み上げ') {
                      // 天気読み上げアクションの場合、messageを音声合成で読み上げる
                      const textToSpeak = actionData.detail.message;
                      if (textToSpeak) {
                        console.log("天気予報読み上げ: " + textToSpeak);
                        const utterance = new SpeechSynthesisUtterance(textToSpeak);
                        speechSynthesis.speak(utterance);
                        message = textToSpeak; // メッセージ自体を天気予報の内容にする
                      } else {
                        message = "天気予報のメッセージがありません。";
                      }
                    } else if (actionData.category === 'アラート' && actionData.sub === '実行') {          // アラートアクションの場合、アラート音を鳴らす
          const alertSound = actionData.detail.sound || 'default';
          console.log("アラート音鳴動: " + alertSound);
          const soundMap = { sound1: 'bet.mp3', sound2: 'error.mp3', sound3: 'gako.mp3', default: 'bet.mp3' };
          const filename = soundMap[alertSound] || alertSound;
          const audio = new Audio(`/static/voice/${filename}`);
          audio.addEventListener('error', () => {
            console.error("アラート音の再生に失敗しました:", filename);
          });
          audio.play().catch((e) => {
            console.error("アラート音の再生に失敗しました:", e);
          });
          message += " -> " + alertSound;
        } else if (executionResult) {
          message += " -> 実行結果: " + executionResult;
        }
        alert(message); // シンプルにalertで表示
      });
    } else {
      console.log("--- DEBUG: pollPendingActions received no actions."); // 追加
    }
  } catch (error) {
    console.error("Error polling pending actions:", error);
  }
}
