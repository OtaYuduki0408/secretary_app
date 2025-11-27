import { populateSelect, updateSubOptions, updateActionSummary, updateConditionSummary } from './ui_helpers.js';
import { createActionUI } from './action_ui.js';
import { createTriggerUI } from './trigger_ui.js';

import { TRIGGER_CATEGORIES, ACTION_CATEGORIES } from './constants.js';

export function addConditionBlock(anchorElement, data={}) {
  console.log(`[DEBUG] addConditionBlock called. Anchor element:`, anchorElement);
  const block = document.createElement("div");
  block.open = true;
  const blockId = `cond_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  block.id = blockId;
  block.className = "condition-block";

  let targetParent = document.getElementById("condition_blocks"); // デフォルトの親
  let referenceElement = null; // afterendで使う要素

  if (anchorElement instanceof Element) {
    if (anchorElement.id === "add-condition" || anchorElement.id === "add-action" || anchorElement.id === "condition_blocks") {
      // index.jsからの初期呼び出し、またはcondition_blocksが直接渡された場合
      targetParent = document.getElementById("condition_blocks");
    } else if (anchorElement.classList.contains("add-sibling-condition") || anchorElement.classList.contains("add-sibling-action")) {
      // 既存ブロック内の「＋ アクションを追加」「＋ 条件を追加」ボタン
      referenceElement = anchorElement.closest(".condition-block, .item");
      if (referenceElement) {
        targetParent = referenceElement.parentNode; // 挿入対象の親は、参照要素の親
      }
    } else if (anchorElement.classList.contains("nested-conditions")) {
      // ネストされた条件ブロックへの追加
      targetParent = anchorElement;
    }
  }
  
  // ネストレベルの計算
  const parentOfNewBlock = referenceElement || targetParent; // 挿入先の親または参照要素
  const actualParentBlock = parentOfNewBlock.closest('.condition-block, .item');
  const parentLevel = actualParentBlock ? parseInt(actualParentBlock.dataset.nestLevel) : -1;
  const nestLevel = parentLevel + 1;
  block.dataset.nestLevel = nestLevel;

  block.innerHTML = `
    <div class="co-block-header">
      <span class="co-toggle-icon">▼</span>
      <span class="co-summary-label condition">IF</span>
      <span class="co-summary-text">条件を設定してください</span>
    </div>
    <div class="co-block-content">
      <select class="condition-type">
        <option value="if">if (この条件を満たしたなら)</option>
        <option value="else">else (上の条件を満たしてないのなら)</option>
      </select>
      <select class="condition-logic">
        <option value="">(先頭)</option>
        <option value="NOT">NOT</option>
        <option value="AND">AND (かつ)</option>
        <option value="OR">OR (または)</option>
        <option value="NAND">NAND (両方が違うなら)</option>
        <option value="NOR">NOR (どちらかが違うなら)</option>
        <option value="XOR">XOR (どちらかが違く、かつ両方が正しくも違くもないのなら)</option>
        <option value="XNOR">XNOR (両方が正しい、または両方が違うなら)</option>
      </select>
      <div class="condition-expr-container"></div>
      <div class="co-block-actions" style="margin-top: 16px; border-top: 1px solid var(--co-border); padding-top: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="add-sibling-action add-button">＋ アクションを追加</button>
        <button class="add-sibling-condition add-button">＋ 条件を追加</button>
        <button class="add-nested-action nest-button">＋ ネストアクション</button>
        <button class="add-nested-condition nest-button">＋ ネスト条件</button>
        <button class="remove-condition remove">削除</button>
      </div>
    </div>
    <div class="nested-blocks">
      <div class="nested-conditions"></div>
      <div class="nested-actions"></div>
    </div>
  `;
  
  if (referenceElement) {
    // 兄弟要素として挿入
    referenceElement.insertAdjacentElement('afterend', block);
  } else {
    // 最後に追加
    targetParent.appendChild(block);
  }

  const header = block.querySelector('.co-block-header');
  const content = block.querySelector('.co-block-content');
  const logicSelect = content.querySelector(".condition-logic");
  const typeSelect = content.querySelector(".condition-type");
  const exprContainer = content.querySelector(".condition-expr-container");

  // 折りたたみロジック
  header.addEventListener('click', () => {
    block.classList.toggle('is-collapsed');
  });
  const nestedConditionsContainer = block.querySelector(".nested-blocks > .nested-conditions");
  const nestedActionsContainer = block.querySelector(".nested-blocks > .nested-actions");

  // Summary updater
  block.addEventListener('change', () => updateConditionSummary(block));
  block.addEventListener('input', () => updateConditionSummary(block));
  setTimeout(() => updateConditionSummary(block), 200); // 復元時のUI描画後に実行

  // ロジック選択の制御 (handleTypeChangeが実行される前に初期設定)
  // `targetParent` ではなく、実際にブロックが追加されたコンテナの直接の子の数で判断する
  const siblings = Array.from(targetParent.children).filter(child => child.classList.contains('condition-block'));
  if (siblings.length === 1 && !referenceElement) { // referenceElementがある場合は常に最初の要素ではない
    logicSelect.querySelector('option[value="AND"]').remove();
    logicSelect.querySelector('option[value="OR"]').remove();
    logicSelect.querySelector('option[value="NAND"]').remove();
    logicSelect.querySelector('option[value="NOR"]').remove();
    logicSelect.querySelector('option[value="XOR"]').remove();
    logicSelect.querySelector('option[value="XNOR"]').remove();
    logicSelect.value = data.logic || "";
  } else if (!referenceElement || (siblings.indexOf(block) > 0 || block.previousElementSibling?.classList.contains('condition-block'))) {
    // referenceElementがない（最後に追加）、またはreferenceElementがあったとしても2つ目以降の要素である場合
    const initialEmptyOption = logicSelect.querySelector('option[value=""]');
    if (initialEmptyOption) initialEmptyOption.remove();
    const initialNotOption = logicSelect.querySelector('option[value="NOT"]');
    if (initialNotOption) initialNotOption.remove();
    logicSelect.value = data.logic || "AND";
  }


  // タイプ選択の制御
  const handleTypeChange = () => {
    const selectedType = typeSelect.value;
    const summaryTextEl = block.querySelector('.co-summary-text');

    if (selectedType === 'else') {
      logicSelect.style.display = 'none';
      exprContainer.innerHTML = '';
      if (summaryTextEl) summaryTextEl.textContent = '上記以外のすべての条件';
    } else {
      logicSelect.style.display = 'block';
      const prefix = `${blockId}_`;
      exprContainer.innerHTML = `
        <label style="font-size:0.9em; opacity:0.8;">条件</label>
        <select id="${prefix}trigger_category"></select>
        <select id="${prefix}trigger_sub"></select>
        <div id="${prefix}trigger_value_container"></div>
      `;
      
      const categorySelect = document.getElementById(`${prefix}trigger_category`);
      const subSelect = document.getElementById(`${prefix}trigger_sub`);
      
      populateSelect(categorySelect.id, TRIGGER_CATEGORIES);

      const exprData = (data.expr && typeof data.expr === 'object') ? data.expr : null;

      if (exprData) {
        categorySelect.value = exprData.category || '';
      }
      
      const updateAndRestore = () => {
        updateSubOptions(`${prefix}trigger_category`, `${prefix}trigger_sub`, TRIGGER_CATEGORIES);
        if (exprData) {
          subSelect.value = exprData.sub || '';
        }
        createTriggerUI(prefix, exprData ? exprData.value : {});

        if (exprData && exprData.value) {
          setTimeout(() => {
            const value = exprData.value;
            const valueContainer = document.getElementById(`${prefix}trigger_value_container`);
            if (!valueContainer) return;

            // 各UI要素に値をセット
            for (const key in value) {
              const input = valueContainer.querySelector(`[id$="${key}"]`);
              if (input) {
                if (input.type === 'checkbox') {
                  input.checked = value[key];
                } else if (input.tagName === 'SELECT' && input.multiple) {
                  // 複数選択のselect要素の復元
                  const selectedValues = Array.isArray(value[key]) ? value[key] : [value[key]];
                  Array.from(input.options).forEach(option => {
                    option.selected = selectedValues.includes(option.value);
                  });
                } else {
                  input.value = value[key];
                }
              }
            }
            // フィルターの復元
            const filterContainer = valueContainer.querySelector(`div[id$="filters"]`);
            if (value.filters && Array.isArray(value.filters) && filterContainer) {
              const addFilterBtn = filterContainer.querySelector('.add_filter_btn');
              if (addFilterBtn) {
                // 既存の空フィルターを削除する場合 (createTriggerUIで生成される可能性のあるもの)
                const existingFilter = filterContainer.querySelector('.filter-item');
                if(existingFilter && !existingFilter.querySelector('input[type="text"]').value) {
                    existingFilter.remove();
                }

                value.filters.forEach(filter => {
                  addFilterBtn.click(); // フィルター追加ボタンをクリックしてUIを生成
                  const newItem = filterContainer.querySelector('.filter-item:last-child');
                  if (newItem) {
                    const textInput = newItem.querySelector('input[type="text"]');
                    const logicSelect = newItem.querySelector('select');
                    const priorityInput = newItem.querySelector('input[type="number"]');
                    if (textInput) textInput.value = filter.text || '';
                    if (logicSelect) logicSelect.value = filter.logic || 'AND';
                    if (priorityInput) priorityInput.value = filter.priority || '';
                  }
                });
              }
            }
            // アクションチェックボックスの復元 (カレンダー、収支管理、メモ)
            if (value.actions && Array.isArray(value.actions)) {
              value.actions.forEach(actionVal => {
                const actionButtonsContainer = valueContainer.querySelector(`div[id$="actions"]`);
                if (actionButtonsContainer) {
                  const button = actionButtonsContainer.querySelector(`button[data-value="${actionVal}"]`);
                  if (button) {
                    button.classList.add('selected');
                  }
                }
              });
            }
          }, 100);
        }
      };
      
      categorySelect.addEventListener('change', updateAndRestore);
      subSelect.addEventListener('change', () => createTriggerUI(prefix));
      
      updateAndRestore();
    }
  };

  // 最初にelseが選ばれてた場合の処理
  typeSelect.value = data.type || "if"; // データ復元
  typeSelect.addEventListener("change", handleTypeChange);
  handleTypeChange(); // 初期表示

  // --- Event Listeners ---
  content.querySelector(".remove-condition").onclick = () => block.remove();
  content.querySelector(".add-nested-action").onclick = (event) => addAction(event.currentTarget.closest(".nested-actions"), {});
  content.querySelector(".add-nested-condition").onclick = (event) => addConditionBlock(event.currentTarget.closest(".nested-conditions"), data);
  
  const siblingActionBtn = content.querySelector(".add-sibling-action");
  const siblingCondBtn = content.querySelector(".add-sibling-condition");

  siblingActionBtn.onclick = (event) => addAction(event.currentTarget, {}); // クリックされたボタン自身を渡す
  siblingCondBtn.onclick = (event) => addConditionBlock(event.currentTarget, data); // クリックされたボタン自身を渡す
}

export function addAction(anchorElement, data={}) {
  console.log(`[DEBUG] addAction called. Anchor element:`, anchorElement);
  const el = document.createElement("div");
  el.open = true;
  el.className = "item";

  let targetParent = document.getElementById("condition_blocks"); // デフォルトの親
  let referenceElement = null; // afterendで使う要素

  if (anchorElement instanceof Element) {
    if (anchorElement.id === "add-action" || anchorElement.id === "add-condition" || anchorElement.id === "condition_blocks") {
      // index.jsからの初期呼び出し、またはcondition_blocksが直接渡された場合
      targetParent = document.getElementById("condition_blocks");
    } else if (anchorElement.classList.contains("add-sibling-action") || anchorElement.classList.contains("add-sibling-condition")) {
      // 既存ブロック内の「＋ アクションを追加」「＋ 条件を追加」ボタン
      referenceElement = anchorElement.closest(".condition-block, .item");
      if (referenceElement) {
        targetParent = referenceElement.parentNode; // 挿入対象の親は、参照要素の親
      }
    } else if (anchorElement.classList.contains("nested-actions")) {
      // ネストされたアクションブロックへの追加
      targetParent = anchorElement;
    }
  }
  
  // ネストレベルの計算
  const parentOfNewBlock = referenceElement || targetParent; // 挿入先の親または参照要素
  const actualParentBlock = parentOfNewBlock.closest('.condition-block, .item');
  const parentLevel = actualParentBlock ? parseInt(actualParentBlock.dataset.nestLevel) : -1;
  const nestLevel = parentLevel + 1;
  el.dataset.nestLevel = nestLevel;
  const prefix = `action_${Date.now()}_${Math.floor(Math.random() * 1e9)}_`;
  
  el.innerHTML = `
    <summary>
      <span class="co-summary-label action">ACTION</span>
      <span class="co-summary-text">アクションを設定してください</span>
    </summary>
    <div class="co-block-content">
      <select class="action-category" id="${prefix}action_category"></select>
      <select class="action-sub" id="${prefix}action_sub"></select>
      <div class="action-timing-container" style="margin-top: 10px;">
        <label style="font-size:0.9em; opacity:0.8;">実行タイミング（無入力で即時実行）</label>
        <input type="date" class="action-timing-date-abs" id="${prefix}action_timing_date_abs" title="実行日（絶対）">
        <input type="number" class="action-timing-date-rel" id="${prefix}action_timing_date_rel" placeholder="+n 日" title="実行日（相対）" style="width: 80px;">
        <input type="time" class="action-timing-time-abs" id="${prefix}action_timing_time_abs" title="実行時刻（絶対）">
        <input type="text" class="action-timing-time-rel" id="${prefix}action_timing_time_rel" placeholder="+HH:MM:SS" title="実行時刻（相対）" style="width: 120px;">
      </div>
      <div class="action-detail-container" id="${prefix}action_detail_container" style="margin-top: 10px;">
        <!-- ここに動的UIが挿入される -->
      </div>
      <div class="co-block-actions" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="add-sibling-action add-button">＋ アクションを追加</button>
        <button class="add-sibling-condition add-button">＋ 条件を追加</button>
        <button class="remove-action remove">削除</button>
      </div>
    </div>
  `;
  
  if (referenceElement) {
    // 兄弟要素として挿入
    referenceElement.insertAdjacentElement('afterend', el);
  } else {
    // 最後に追加
    targetParent.appendChild(el);
  }

  // Summary updater
  el.addEventListener('change', () => updateActionSummary(el));
  el.addEventListener('input', () => updateActionSummary(el));
  setTimeout(() => updateActionSummary(el), 200);

  const content = el.querySelector('.co-block-content');
  content.querySelector(".remove-action").onclick=()=>el.remove();
  
  const siblingActionBtn = content.querySelector(".add-sibling-action");
  const siblingCondBtn = content.querySelector(".add-sibling-condition");

  siblingActionBtn.onclick = (event) => addAction(event.currentTarget, {}); // クリックされたボタン自身を渡す
  siblingCondBtn.onclick = (event) => addConditionBlock(event.currentTarget, data); // クリックされたボタン自身を渡す

  const categorySelect = content.querySelector(".action-category");
  const subSelect = content.querySelector(".action-sub");
  
  populateSelect(categorySelect.id, ACTION_CATEGORIES);

  categorySelect.addEventListener('change', () => {
    updateSubOptions(categorySelect.id, subSelect.id, ACTION_CATEGORIES);
    createActionUI(prefix);
  });
  subSelect.addEventListener('change', () => {
    createActionUI(prefix);
  });
  
  // データ復元
  if (data.category) {
    categorySelect.value = data.category;
  }
  updateSubOptions(categorySelect.id, subSelect.id, ACTION_CATEGORIES);
  if (data.sub) {
    subSelect.value = data.sub;
  }
  createActionUI(prefix, data.detail);

  setTimeout(() => {
    if (data.timing) {
      el.querySelector(".action-timing-date-abs").value = data.timing.date_abs || "";
      el.querySelector(".action-timing-date-rel").value = data.timing.date_rel || "";
      el.querySelector(".action-timing-time-abs").value = data.timing.time_abs || "";
      el.querySelector(".action-timing-time-rel").value = data.timing.time_rel || "";
    }
  }, 100);
}