import { addConditionBlock, addAction } from './block_operations.js';
import { populateSelect } from './ui_helpers.js';
import { createTriggerUI } from './trigger_ui.js';
import { createActionUI } from './action_ui.js'; // createActionUI も必要
import { TRIGGER_CATEGORIES, ACTION_CATEGORIES } from './constants.js';

export function parseActionArray(actionRoot) {
  if (!actionRoot) return [];
  return [...actionRoot.children]
    .filter(child => child.classList.contains('item'))
    .map(actionItem => {
      const prefix = actionItem.querySelector('.action-category').id.replace('action_category', '');
      const category = actionItem.querySelector(".action-category").value;
      const sub = actionItem.querySelector(".action-sub").value;
      const timing = {
        date_abs: actionItem.querySelector(".action-timing-date-abs").value,
        date_rel: actionItem.querySelector(".action-timing-date-rel").value,
        time_abs: actionItem.querySelector(".action-timing-time-abs").value,
        time_rel: actionItem.querySelector(".action-timing-time-rel").value,
      };
      let detail = {};
      const detailContainer = actionItem.querySelector(".action-detail-container");

      switch (category) {
        case "カレンダー":
          if (sub === "追加" || sub === "削除") {
            detail.text = detailContainer.querySelector(".action-detail-cal-text")?.value;
          } else if (sub === "読み上げ") {
            detail.start_year = detailContainer.querySelector(".action-detail-cal-read-start-year")?.value;
            detail.start_month = detailContainer.querySelector(".action-detail-cal-read-start-month")?.value;
            detail.start_day = detailContainer.querySelector(".action-detail-cal-read-start-day")?.value;
            detail.start_time = detailContainer.querySelector(".action-detail-cal-read-start-time")?.value;
            detail.end_year = detailContainer.querySelector(".action-detail-cal-read-end-year")?.value;
            detail.end_month = detailContainer.querySelector(".action-detail-cal-read-end-month")?.value;
            detail.end_day = detailContainer.querySelector(".action-detail-cal-read-end-day")?.value;
            detail.end_time = detailContainer.querySelector(".action-detail-cal-read-end-time")?.value;
          }
          break;
        case "収支管理":
          if (sub === "読み上げ") {
            detail.item = detailContainer.querySelector(".action-detail-fin-read-item")?.value;
            detail.format = detailContainer.querySelector(".action-detail-fin-read-format")?.value;
            detail.start_year = detailContainer.querySelector(".action-detail-fin-read-start-year")?.value;
            detail.start_month = detailContainer.querySelector(".action-detail-fin-read-start-month")?.value;
            detail.start_day = detailContainer.querySelector(".action-detail-fin-read-start-day")?.value;
            detail.start_time = detailContainer.querySelector(".action-detail-fin-read-start-time")?.value;
            detail.end_year = detailContainer.querySelector(".action-detail-fin-read-end-year")?.value;
            detail.end_month = detailContainer.querySelector(".action-detail-fin-read-end-month")?.value;
            detail.end_day = detailContainer.querySelector(".action-detail-fin-read-end-day")?.value;
            detail.end_time = detailContainer.querySelector(".action-detail-fin-read-end-time")?.value;
          }
          break;
        case "メモ":
          if (sub === "読み上げ") {
            detail.start_year = detailContainer.querySelector(".action-detail-memo-read-start-year")?.value;
            detail.start_month = detailContainer.querySelector(".action-detail-memo-read-start-month")?.value;
            detail.start_day = detailContainer.querySelector(".action-detail-memo-read-start-day")?.value;
            detail.start_time = detailContainer.querySelector(".action-detail-memo-read-start-time")?.value;
            detail.end_year = detailContainer.querySelector(".action-detail-memo-read-end-year")?.value;
            detail.end_month = detailContainer.querySelector(".action-detail-memo-read-end-month")?.value;
            detail.end_day = detailContainer.querySelector(".action-detail-memo-read-end-day")?.value;
            detail.end_time = detailContainer.querySelector(".action-detail-memo-read-end-time")?.value;
          }
          break;
        case "メール":
          if (sub === "送信") {
            detail.subject = detailContainer.querySelector(".action-detail-mail-subject")?.value;
            detail.body = detailContainer.querySelector(".action-detail-mail-body")?.value;
          }
          break;
      }

      const actionData = { category, sub, timing, detail };
      actionData.nested = parseConditions(actionItem.querySelector(".nested-conditions"));
      actionData.actions = parseActionArray(actionItem.querySelector(".nested-actions"));
      
      if (actionData.nested.length === 0) delete actionData.nested;
      if (actionData.actions.length === 0) delete actionData.actions;

      return actionData;
    });
}

export function parseConditions(root){
  return [...root.children]
    .filter(child => child.classList.contains('condition-block'))
    .map(block => {
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
            const category = categorySelect.value;
            const sub = subSelect.value;

            switch (category) {
              case "場所":
                value.address = valueContainer.querySelector(`[id$="trigger_value_address"]`)?.value;
                value.latitude = valueContainer.querySelector(`[id$="trigger_value_latitude"]`)?.value;
                value.longitude = valueContainer.querySelector(`[id$="trigger_value_longitude"]`)?.value;
                value.range = valueContainer.querySelector(`[id$="trigger_value_range"]`)?.value;
                break;
              case "カレンダー":
                if (sub === "入力があったら") {
                  value.actions = [...valueContainer.querySelectorAll(`#${prefix}trigger_value_calendar_actions button.selected`)].map(btn => btn.dataset.value);
                  value.filters = [...valueContainer.querySelectorAll(".filter-item")].map(item => ({
                    text: item.querySelector(".calendar_filter_text")?.value,
                    logic: item.querySelector(".calendar_filter_logic")?.value
                  }));
                } else if (sub === "予定の時間になったら") {
                  value.title = valueContainer.querySelector(`[id$="trigger_value_cal_title"]`)?.value;
                  value.start_year = valueContainer.querySelector(`[id$="trigger_value_cal_start_year"]`)?.value;
                  value.start_month = valueContainer.querySelector(`[id$="trigger_value_cal_start_month"]`)?.value;
                  value.start_day = valueContainer.querySelector(`[id$="trigger_value_cal_start_day"]`)?.value;
                  value.day_of_week = [...valueContainer.querySelectorAll(`[id$="trigger_value_cal_day_of_week_buttons"] button.selected`)].map(btn => btn.dataset.value);
                  value.start_time = valueContainer.querySelector(`[id$="trigger_value_cal_start_time"]`)?.value;
                  value.end_year = valueContainer.querySelector(`[id$="trigger_value_cal_end_year"]`)?.value;
                  value.end_month = valueContainer.querySelector(`[id$="trigger_value_cal_end_month"]`)?.value;
                  value.end_day = valueContainer.querySelector(`[id$="trigger_value_cal_end_day"]`)?.value;
                  value.end_time = valueContainer.querySelector(`[id$="trigger_value_cal_end_time"]`)?.value;
                }
                break;
              case "収支管理":
                if (sub === "入力があったら") {
                  value.actions = [...valueContainer.querySelectorAll(`#${prefix}trigger_value_finance_actions button.selected`)].map(btn => btn.dataset.value);
                  if (value.actions.includes('追加')) {
                    value.genres = [...valueContainer.querySelectorAll(`#${prefix}trigger_value_finance_genres button.selected`)].map(btn => btn.dataset.value);
                  }
                } else if (sub === "特定金額になったら") {
                  value.item = valueContainer.querySelector(`[id$="trigger_value_finance_item"]`)?.value;
                  value.amount = valueContainer.querySelector(`[id$="trigger_value_finance_amount"]`)?.value;
                  value.percentage = valueContainer.querySelector(`[id$="trigger_value_finance_percentage"]`)?.value;
                }
                break;
              case "メモ":
                value.actions = [...valueContainer.querySelectorAll(`#${prefix}trigger_value_memo_actions button.selected`)].map(btn => btn.dataset.value);
                value.filters = [...valueContainer.querySelectorAll(".filter-item")].map(item => ({
                  text: item.querySelector(".memo_filter_text")?.value,
                  logic: item.querySelector(".memo_filter_logic")?.value
                }));
                break;
              case "時間":
                // `prefix` がある場合は条件設定なので、範囲指定UIから値を取得
                value.start_year = valueContainer.querySelector(`[id$='_time_start_year']`)?.value;
                value.start_month = valueContainer.querySelector(`[id$='_time_start_month']`)?.value;
                value.start_day = valueContainer.querySelector(`[id$='_time_start_day']`)?.value;
                value.day_of_week = [...valueContainer.querySelectorAll(`[id$='_time_day_of_week_buttons'] button.selected`)].map(btn => btn.dataset.value);
                value.start_time = valueContainer.querySelector(`[id$='_time_start_time']`)?.value;
                value.end_year = valueContainer.querySelector(`[id$='_time_end_year']`)?.value;
                value.end_month = valueContainer.querySelector(`[id$='_time_end_month']`)?.value;
                value.end_day = valueContainer.querySelector(`[id$='_time_end_day']`)?.value;
                value.end_time = valueContainer.querySelector(`[id$='_time_end_time']`)?.value;
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

    return {
      logic: block.querySelector(".condition-logic").value,
      type: type,
      expr: expr,
      nested: parseConditions(block.querySelector(".nested-conditions")),
      actions: parseActionArray(block.querySelector(".nested-actions"))
    };
  });
}

export function loadCommandToForm(cmd){
  console.log("--- [DEBUG] loadCommandToForm called with cmd:", cmd); // デバッグログ追加
  // フォームをリセット
  document.getElementById("name").value = "";
  document.getElementById("trigger_category").value = "";
  document.getElementById("trigger_sub").innerHTML = "<option value=''>選択してください</option>";
  document.getElementById("trigger_value_container").innerHTML = '<input type="text" id="trigger_value" placeholder="値">';
  document.getElementById("condition_blocks").innerHTML = "";
  document.getElementById("action_category").value = "";
  document.getElementById("action_sub").innerHTML = "<option value=''>選択してください</option>";
  document.getElementById("action_detail_container").innerHTML = "";
  document.getElementById("command-id")?.remove();


  // データをフォームに設定
  document.getElementById("name").value = cmd.name;
  
  // Triggerの復元
  if (cmd.triggers && cmd.triggers.length > 0) {
    const trigger = cmd.triggers[0];
    console.log("--- [DEBUG] Restoring trigger:", trigger); // デバッグログ追加
    const triggerCategorySelect = document.getElementById("trigger_category");
    const triggerSubSelect = document.getElementById("trigger_sub");

    triggerCategorySelect.value = trigger.category || "";
    // updateSubOptions(triggerCategorySelect.id, triggerSubSelect.id, TRIGGER_CATEGORIES); // createTriggerUI内で呼ばれるためコメントアウト
    triggerSubSelect.value = trigger.sub || "";
    // createTriggerUI(''); // ここでUIを再生成すると、setTimeoutの前にinnerHTMLがクリアされる可能性がある

    // 動的に生成されたトリガー詳細UIに値を設定
    // createTriggerUIにtrigger.valueを渡してUI生成と値の設定を一度に行う
    createTriggerUI('', trigger.value);
  }

  document.getElementById("condition_blocks").innerHTML="";
  (cmd.conditions||[]).forEach(c=>addConditionBlockFromData(c, document.getElementById("condition_blocks")));

  if(cmd.actions?.length > 0){
    const a = cmd.actions[0];
    const categorySelect = document.getElementById("action_category");
    const subSelect = document.getElementById("action_sub");

    categorySelect.value = a.category || "";
    // updateSubOptions(categorySelect.id, subSelect.id, ACTION_CATEGORIES); // createActionUI内で呼ばれるためコメントアウト
    subSelect.value = a.sub || "";
    createActionUI('');

    setTimeout(() => {
      if (a.timing) {
        document.getElementById("action_timing_date_abs").value = a.timing.date_abs || "";
        document.getElementById("action_timing_date_rel").value = a.timing.date_rel || "";
        document.getElementById("action_timing_time_abs").value = a.timing.time_abs || "";
        document.getElementById("action_timing_time_rel").value = a.timing.time_rel || "";
      }
      if (a.detail) {
        const detailContainer = document.getElementById("action_detail_container");
        for(const key in a.detail) {
          const input = detailContainer.querySelector(`[class*="${key}"]`);
          if(input) {
            if (input.type === 'checkbox') {
              input.checked = a.detail[key];
            } else if (input.tagName === 'SELECT' && input.multiple) {
              const selectedValues = Array.isArray(a.detail[key]) ? a.detail[key] : [a.detail[key]];
              Array.from(input.options).forEach(option => {
                option.selected = selectedValues.includes(option.value);
              });
            } else {
              input.value = a.detail[key];
            }
          }
        }
      }
    }, 100);
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
  const triggerSub = document.getElementById("trigger_sub").value;
  let triggerValue = {};
  const triggerContainer = document.getElementById("trigger_value_container");

  // Triggerのデータ収集ロジック
  switch (triggerCategory) {
    case "場所":
      triggerValue.address = triggerContainer.querySelector("#trigger_value_address")?.value;
      triggerValue.latitude = triggerContainer.querySelector("#trigger_value_latitude")?.value;
      triggerValue.longitude = triggerContainer.querySelector("#trigger_value_longitude")?.value;
      triggerValue.range = triggerContainer.querySelector("#trigger_value_range")?.value;
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
      triggerValue.year = triggerContainer.querySelector("#trigger_value_time_year")?.value;
      triggerValue.month = triggerContainer.querySelector("#trigger_value_time_month")?.value;
      triggerValue.day = triggerContainer.querySelector("#trigger_value_time_day")?.value;
      triggerValue.day_of_week = [...triggerContainer.querySelectorAll("#trigger_value_time_day_of_week_buttons button.selected")].map(btn => btn.dataset.value);
      triggerValue.time_start = triggerContainer.querySelector("#trigger_value_time_time_start")?.value;
      // triggerValue.time_end = triggerContainer.querySelector("#trigger_value_time_time_end")?.value; // 時間カテゴリのメインUIにはtime_endがないため削除
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
