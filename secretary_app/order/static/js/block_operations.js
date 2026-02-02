import { populateSelect, updateSubOptions, updateActionSummary, updateConditionSummary } from './ui_helpers.js';
import { createActionUI } from './action_ui.js';
import { createTriggerUI } from './trigger_ui.js';

import { TRIGGER_CATEGORIES, ACTION_CATEGORIES, CONDITION_CATEGORIES } from './constants.js';

export function addConditionBlock(anchorElement, data={}) {
  console.log(`[START] addConditionBlock called. anchorElement:`, anchorElement);
  if (!anchorElement) {
    console.error(`[ERROR] addConditionBlock: anchorElement is null or undefined. Aborting.`);
    return;
  }
  console.log(`[INFO] anchorElement details (id: ${anchorElement?.id}, class: ${anchorElement?.className}, tag: ${anchorElement?.tagName})`);
  const block = document.createElement("div");
  block.open = true;
  const blockId = `cond_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  block.id = blockId;
  block.className = "condition-block";

  let targetParent = document.getElementById("condition_blocks"); // デフォルトの親
  let referenceElement = null; // afterendで使う要素

  if (anchorElement instanceof Element) {
    if (anchorElement.id === "add-condition" || anchorElement.id === "add-action" || anchorElement.id === "condition_blocks") {
      console.log(`[BRANCH] addConditionBlock: Matched initial call or condition_blocks ID/class.`);
      targetParent = document.getElementById("condition_blocks");
    } else if (anchorElement.classList.contains("add-sibling-condition") || anchorElement.classList.contains("add-sibling-action")) {
      console.log(`[BRANCH] addConditionBlock: Matched sibling button.`);
      referenceElement = anchorElement.closest(".condition-block, .item");
      if (referenceElement) {
        targetParent = referenceElement.parentNode; // 挿入対象の親は、参照要素の親
        console.log(`[INFO] addConditionBlock: Sibling button found referenceElement.parentNode as targetParent (id: ${targetParent?.id}, class: ${targetParent?.className}).`);
      } else {
        console.warn(`[WARN] addConditionBlock: Sibling button did NOT find a referenceElement.`);
      }
    } else if (anchorElement.classList.contains("nested-conditions")) {
      console.log(`[BRANCH] addConditionBlock: Matched nested-conditions container.`);
      targetParent = anchorElement;
    } else {
      console.log(`[BRANCH] addConditionBlock: anchorElement is an Element, but did not match specific conditions. Defaulting to condition_blocks.`);
    }
  } else {
    console.log(`[BRANCH] addConditionBlock: anchorElement is NOT an Element. Defaulting to condition_blocks.`);
  }

  // ネストレベルの計算に必要な変数を定義
  const parentOfNewBlock = referenceElement || targetParent; // 挿入先の親または参照要素
  const actualParentBlock = parentOfNewBlock.closest('.condition-block, .item'); // ここで定義する

  let nestLevel;
  if (referenceElement) { // 兄弟要素として追加する場合
    // referenceElementと同じネストレベルにする
    nestLevel = parseInt(referenceElement.dataset.nestLevel || 0); // トップレベルの兄弟は0
    if (isNaN(nestLevel)) nestLevel = 0; // 万が一NaNの場合のフォールバック
  } else { // ネスト要素として追加する場合、またはトップレベルに追加する場合
    const parentLevel = actualParentBlock ? parseInt(actualParentBlock.dataset.nestLevel || 0) : -1;
    nestLevel = parentLevel + 1;
  }
  block.dataset.nestLevel = nestLevel;
  console.log(`[INFO] addConditionBlock: Calculated nestLevel: ${nestLevel}, actualParentBlock:`, actualParentBlock);
  console.log(`[INFO] addConditionBlock: Final targetParent:`, targetParent, `Final referenceElement:`, referenceElement);

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
      
      populateSelect(categorySelect.id, CONDITION_CATEGORIES);

      const exprData = (data.expr && typeof data.expr === 'object') ? data.expr : null;

      if (exprData) {
        categorySelect.value = exprData.category || '';
      }
      
      const updateAndRestore = () => {
        updateSubOptions(`${prefix}trigger_category`, `${prefix}trigger_sub`, CONDITION_CATEGORIES);
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
  content.querySelector(".remove-condition").onclick = () => {
    console.log(`[CLICK] Remove Condition button clicked for block: ${blockId}`);
    block.remove();
  };
  content.querySelector(".add-nested-action").onclick = (event) => {
    console.log(`[CLICK] "＋ ネストアクション" button clicked for block: ${blockId}`);
    const targetNestedActionsContainer = event.currentTarget.closest(".condition-block").querySelector(".nested-actions"); // block要素の子として.nested-actionsを探す
    console.log(`[DEBUG] addAction called with anchorElement (nestedActionsContainer):`, targetNestedActionsContainer);
    addAction(targetNestedActionsContainer, {});
  };
  content.querySelector(".add-nested-condition").onclick = (event) => {
    console.log(`[CLICK] "＋ ネスト条件" button clicked for block: ${blockId}`);
    const targetNestedConditionsContainer = event.currentTarget.closest(".condition-block").querySelector(".nested-conditions"); // block要素の子として.nested-conditionsを探す
    console.log(`[DEBUG] addConditionBlock called with anchorElement (nestedConditionsContainer):`, targetNestedConditionsContainer);
    addConditionBlock(targetNestedConditionsContainer, data);
  };
  
  const siblingActionBtn = content.querySelector(".add-sibling-action");
  const siblingCondBtn = content.querySelector(".add-sibling-condition");

  siblingActionBtn.onclick = (event) => {
    console.log(`[CLICK] "＋ アクションを追加" (sibling) button clicked for block: ${blockId}`);
    addAction(event.currentTarget, {}); // クリックされたボタン自身を渡す
  };
  siblingCondBtn.onclick = (event) => {
    console.log(`[CLICK] "＋ 条件を追加" (sibling) button clicked for block: ${blockId}`);
    addConditionBlock(event.currentTarget, data); // クリックされたボタン自身を渡す
  };}

export function addAction(anchorElement, data={}) {
  console.log(`[START] addAction called. anchorElement:`, anchorElement);
  if (!anchorElement) {
    console.error(`[ERROR] addAction: anchorElement is null or undefined. Aborting.`);
    return;
  }
  console.log(`[INFO] anchorElement details (id: ${anchorElement?.id}, class: ${anchorElement?.className}, tag: ${anchorElement?.tagName})`);
  const el = document.createElement("div");
  el.open = true;
  el.className = "item";

  let targetParent = document.getElementById("condition_blocks"); // デフォルトの親
  let referenceElement = null; // afterendで使う要素

  if (anchorElement instanceof Element) {
    if (anchorElement.id === "add-action" || anchorElement.id === "add-condition" || anchorElement.id === "condition_blocks") {
      console.log(`[DEBUG] addAction: Matching initial call or condition_blocks ID/class.`);
      targetParent = document.getElementById("condition_blocks");
    } else if (anchorElement.classList.contains("add-sibling-action") || anchorElement.classList.contains("add-sibling-condition")) {
      console.log(`[DEBUG] addAction: Matching sibling button.`);
      referenceElement = anchorElement.closest(".condition-block, .item");
      if (referenceElement) {
        targetParent = referenceElement.parentNode; // 挿入対象の親は、参照要素の親
        console.log(`[DEBUG] addAction: Sibling button found referenceElement.parentNode as targetParent:`, targetParent);
      } else {
        console.warn(`[DEBUG] addAction: Sibling button did NOT find a referenceElement.`);
      }
    } else if (anchorElement.classList.contains("nested-actions")) {
      console.log(`[DEBUG] addAction: Matching nested-actions container.`);
      targetParent = anchorElement;
    } else {
      console.log(`[DEBUG] addAction: anchorElement is an Element, but did not match specific conditions. Defaulting to condition_blocks.`);
    }
  } else {
    console.log(`[DEBUG] addAction: anchorElement is NOT an Element. Defaulting to condition_blocks.`);
  }
  
  // ネストレベルの計算に必要な変数を定義
  const parentOfNewBlock = referenceElement || targetParent; // 挿入先の親または参照要素
  const actualParentBlock = parentOfNewBlock.closest('.condition-block, .item'); // ここで定義する

  let nestLevel;
  if (referenceElement) { // 兄弟要素として追加する場合
    // referenceElementと同じネストレベルにする
    nestLevel = parseInt(referenceElement.dataset.nestLevel || 0); // トップレベルの兄弟は0
    if (isNaN(nestLevel)) nestLevel = 0; // 万が一NaNの場合のフォールバック
  } else { // ネスト要素として追加する場合、またはトップレベルに追加する場合
    const parentLevel = actualParentBlock ? parseInt(actualParentBlock.dataset.nestLevel || 0) : -1;
    nestLevel = parentLevel + 1;
  }
  el.dataset.nestLevel = nestLevel;
  console.log(`[DEBUG] addAction: Calculated nestLevel: ${nestLevel}, actualParentBlock:`, actualParentBlock);
  console.log(`[DEBUG] addAction: Final targetParent:`, targetParent, `Final referenceElement:`, referenceElement);
  const prefix = `action_${Date.now()}_${Math.floor(Math.random() * 1e9)}_`;
  
  el.innerHTML = `
    <summary>
      <span class="co-summary-label action">ACTION</span>
      <span class="co-summary-text">アクションを設定してください</span>
    </summary>
    <div class="co-block-content">
      <select class="action-category" id="${prefix}action_category"></select>
      <select class="action-sub" id="${prefix}action_sub"></select>
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
  content.querySelector(".remove-action").onclick=() => {
    console.log(`[CLICK] Remove Action button clicked for action: ${prefix}`);
    el.remove();
  };
  
  const siblingActionBtn = content.querySelector(".add-sibling-action");
  const siblingCondBtn = content.querySelector(".add-sibling-condition");

  siblingActionBtn.onclick = (event) => {
    console.log(`[CLICK] "＋ アクションを追加" (sibling) button clicked for action: ${prefix}`);
    addAction(event.currentTarget, {}); // クリックされたボタン自身を渡す
  };
  siblingCondBtn.onclick = (event) => {
    console.log(`[CLICK] "＋ 条件を追加" (sibling) button clicked for action: ${prefix}`);
    addConditionBlock(event.currentTarget, data); // クリックされたボタン自身を渡す
  };
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