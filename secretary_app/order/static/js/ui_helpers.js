import { TRIGGER_CATEGORIES, ACTION_CATEGORIES } from './constants.js';

export function updateActionSummary(block) {
    const summaryTextEl = block.querySelector('.co-summary-text');
    if (!summaryTextEl) return;

    const categoryEl = block.querySelector('.action-category');
    const subEl = block.querySelector('.action-sub');

    const category = categoryEl ? categoryEl.value : '';
    const sub = subEl ? subEl.value : '';

    if (category && sub) {
        summaryTextEl.textContent = `${category}: ${sub}`;
    } else {
        summaryTextEl.textContent = 'アクションを設定してください';
    }
}

export function updateConditionSummary(block) {
    const summaryTextEl = block.querySelector('.co-summary-text');
    if (!summaryTextEl) return;

    const typeEl = block.querySelector('.condition-type');
    if (typeEl && typeEl.value === 'else') {
        summaryTextEl.textContent = '上記以外のすべての条件';
        return;
    }

    const categoryEl = block.querySelector('[id*="_trigger_category"]');
    const subEl = block.querySelector('[id*="_trigger_sub"]');
    
    const category = categoryEl ? categoryEl.value : '';
    const sub = subEl ? subEl.value : '';
    
    let summary = '';
    if (category) {
        summary += `${category}`;
        if (sub) {
            summary += ` - ${sub}`;
        }
    } else {
        summaryTextEl.textContent = '条件を設定してください';
        return;
    }
    
    const valueContainer = block.querySelector('[id*="_trigger_value_container"]');
    if (valueContainer) {
        const inputs = valueContainer.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="time"]');
        for (const input of inputs) {
            if (input.value && !input.readOnly && input.offsetParent !== null) { // 値があり、読み取り専用でなく、表示されている
                summary += ` (${input.value})`;
                break; 
            }
        }
    }

    summaryTextEl.textContent = summary;
}

export function populateSelect(selectId, options) {
  console.log(`populateSelect called for ${selectId} with options:`, options);
  const select = document.getElementById(selectId);
  select.innerHTML = "<option value=''>選択してください</option>";
  for (const key in options) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  }
}

// createTriggerUIとcreateActionUIがui_helpersに依存するため、ここでは定義しないが、createTriggerUIとcreateActionUIから呼び出される
export function updateSubOptions(categoryId, subId, data) {
  const prefix = categoryId.replace('trigger_category', '').replace('action_category', '');
  const cat = document.getElementById(categoryId).value;
  const sub = document.getElementById(subId);
  sub.innerHTML = "<option value=''>選択してください</option>";
  if (data[cat]) data[cat].forEach(v=>{ const o=document.createElement("option"); o.value=v;o.textContent=v; sub.appendChild(o); });

  // ここでcreateTriggerUIやcreateActionUIを直接呼び出すと循環参照になるため、
  // updateSubOptionsの呼び出し元で適切なUI生成関数を呼び出すように変更が必要。
  // 一旦コメントアウトするか、createTriggerUI, createActionUIを引数で受け取るように変更する。
  // 現在は、この関数は直接UIを生成せず、呼び出し元に任せる形にしています。
  // if (categoryId.includes('trigger')) {
  //   if (cat === "場所" || cat === "メモ") {
  //     sub.style.display = 'none';
  //   } else if (cat === "時間") {
  //     sub.style.display = 'none';
  //   } else {
  //     sub.style.display = 'block';
  //   }
  //   createTriggerUI(prefix);
  // } else {
  //   createActionUI(prefix);
  // }
  // 上記を削除し、UIの表示/非表示のみを制御するように変更。createTriggerUI/createActionUIの呼び出しは親側で行う。
  if (categoryId.includes('trigger')) {
    if (cat === "場所" || cat === "メモ" || cat === "ボイス" || (cat === "カレンダー" && categoryId.startsWith("cond_")) || (cat === "収支管理" && categoryId.startsWith("cond_"))) {
      sub.style.display = 'none';
      if (data[cat] && data[cat].length > 0) {
        sub.value = data[cat][0];
      }
    } else if (cat === "時間") {
      sub.style.display = 'none';
      if (data[cat] && data[cat].length > 0) {
        sub.value = data[cat][0];
      }
    } else {
      sub.style.display = 'block';
    }
  } else if (categoryId.includes('action')) {
    const subOptions = data[cat] || [];
    if (subOptions.length <= 1) {
      sub.style.display = 'none';
      if (subOptions.length === 1) {
        sub.value = subOptions[0];
      }
    } else {
      sub.style.display = 'block';
    }
  }
}
