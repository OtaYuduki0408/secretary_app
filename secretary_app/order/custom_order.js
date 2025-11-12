//------------------------------------------------------
// custom_order.js
// if/elif/else対応＋ネスト条件/アクション＋編集対応版
// メッセージ表示対応版
//------------------------------------------------------

// --------------------
// 大項目データ定義
// --------------------
const TRIGGER_CATEGORIES = {
  "場所": ["現在地が◯◯", "特定エリアに入った", "特定エリアを出た"],
  "カレンダー": ["特定日付", "曜日", "予定がある", "予定がない"],
  "収支管理": ["残高が◯◯円以下", "出費が◯◯円を超えた", "収入があった"],
  "メモ": ["メモに◯◯が追加された", "特定キーワードが含まれた"],
};

const ACTION_CATEGORIES = {
  "収支管理": ["登録", "削除", "変更", "取得"],
  "カレンダー": ["登録", "削除", "変更", "取得"],
  "メモ": ["登録", "削除", "変更", "取得"],
  "時刻": ["通知", "タイマー開始", "タイマー停止"]
};

// --------------------
// セレクト生成
// --------------------
function populateSelect(selectId, options) {
  const select = document.getElementById(selectId);
  select.innerHTML = "<option value=''>選択してください</option>";
  for (const key in options) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  }
}

function updateSubOptions(categoryId, subId, data) {
  const cat = document.getElementById(categoryId).value;
  const sub = document.getElementById(subId);
  sub.innerHTML = "<option value=''>選択してください</option>";

  if (data[cat]) {
    data[cat].forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sub.appendChild(opt);
    });
  }
}

// --------------------
// 条件ブロック追加（ネスト＋if/elif/else対応）
// --------------------
function addConditionBlock(parent = document.getElementById("condition_blocks"), data={}) {
  const block = document.createElement("div");
  block.className = "condition-block";

  block.innerHTML = `
    <select class="condition-logic">
      <option value="">(最初)</option>
      <option value="AND">AND</option>
      <option value="OR">OR</option>
    </select>
    <select class="condition-type">
      <option value="if">if</option>
      <option value="elif">elif</option>
      <option value="else">else</option>
    </select>
    <input type="text" class="condition-expr" placeholder="例: x > 5" />
    <button class="add-nested-condition">＋ ネスト条件追加</button>
    <button class="add-nested-action">＋ ネストアクション追加</button>
    <button class="remove-condition">削除</button>
    <div class="nested-conditions" style="margin-left:20px;"></div>
    <div class="nested-actions" style="margin-left:20px;"></div>
  `;

  parent.appendChild(block);

  const typeSelect = block.querySelector(".condition-type");
  const exprInput = block.querySelector(".condition-expr");

  typeSelect.addEventListener("change", () => {
    if (typeSelect.value === "else") {
      exprInput.disabled = true;
      exprInput.value = "";
    } else {
      exprInput.disabled = false;
    }
  });

  typeSelect.value = data.type || "if";
  exprInput.value = data.expr || "";

  block.querySelector(".remove-condition").onclick = () => block.remove();
  block.querySelector(".add-nested-condition").onclick = () =>
    addConditionBlock(block.querySelector(".nested-conditions"));
  block.querySelector(".add-nested-action").onclick = () =>
    addAction(block.querySelector(".nested-actions"));
}

// --------------------
// アクション追加（ネスト対応）
// --------------------
function addAction(parent, a={category:"メモ", sub:"登録", timing:"今すぐ", detail:""}) {
  const el = document.createElement("div");
  el.className = "item";
  el.innerHTML = `
    <select class="action-category">
      <option value="カレンダー">カレンダー</option>
      <option value="メモ">メモ</option>
      <option value="収支管理">収支管理</option>
      <option value="時刻">時刻</option>
    </select>
    <select class="action-sub">
      <option value="登録">登録</option>
      <option value="削除">削除</option>
      <option value="変更">変更</option>
      <option value="取得">取得</option>
    </select>
    <input type="text" class="action-timing" placeholder="実行タイミング" value="${a.timing}" />
    <textarea class="action-detail" placeholder="内容">${a.detail}</textarea>
    <button class="remove-action">削除</button>
  `;

  el.querySelector(".remove-action").onclick = () => el.remove();
  el.querySelector(".action-category").value = a.category;
  el.querySelector(".action-sub").value = a.sub;

  parent.appendChild(el);
}

// --------------------
// 再帰的に条件＋ネストアクションを取得
// --------------------
function parseConditions(root) {
  return [...root.children].map(block => ({
    logic: block.querySelector(".condition-logic").value,
    type: block.querySelector(".condition-type").value,
    expr: block.querySelector(".condition-expr").value,
    nested: parseConditions(block.querySelector(".nested-conditions")),
    actions: [...block.querySelectorAll(".nested-actions > .item")].map(a => ({
      category: a.querySelector(".action-category").value,
      sub: a.querySelector(".action-sub").value,
      timing: a.querySelector(".action-timing").value,
      detail: a.querySelector(".action-detail").value
    }))
  }));
}

// --------------------
// 過去命令をフォームにロード（編集用）
// --------------------
function loadCommandToForm(cmd) {
  document.getElementById("name").value = cmd.name;

  document.getElementById("command-id")?.remove();
  const hiddenId = document.createElement("input");
  hiddenId.type = "hidden";
  hiddenId.id = "command-id";
  hiddenId.value = cmd.id;
  document.getElementById("register-btn").parentNode.appendChild(hiddenId);

  const condRoot = document.getElementById("condition_blocks");
  condRoot.innerHTML = "";
  cmd.conditions.forEach(c => addConditionBlockFromData(c, condRoot));

  if (cmd.actions.length > 0) {
    const a = cmd.actions[0];
    document.getElementById("action_category").value = a.category;
    document.getElementById("action_sub").value = a.sub;
    document.getElementById("action_detail").value = a.detail || "";
  }
}

// --------------------
// データから条件ブロックを生成（再帰）
// --------------------
function addConditionBlockFromData(data, parent) {
  addConditionBlock(parent, { type: data.type, expr: data.expr });
  const block = parent.lastElementChild;

  if (data.nested && data.nested.length > 0) {
    data.nested.forEach(n => addConditionBlockFromData(n, block.querySelector(".nested-conditions")));
  }
  if (data.actions && data.actions.length > 0) {
    data.actions.forEach(a => addAction(block.querySelector(".nested-actions"), a));
  }
}

// --------------------
// 命令登録（新規 or 更新）
// --------------------
async function registerCommand() {
  const id = document.getElementById("command-id")?.value || null;
  const name = document.getElementById("name").value;
  const triggerCategory = document.getElementById("trigger_category").value;
  const triggerSub = document.getElementById("trigger_sub").value;
  const triggerValue = document.getElementById("trigger_value").value;
  const conditions = parseConditions(document.getElementById("condition_blocks"));
  const actionCategory = document.getElementById("action_category").value;
  const actionSub = document.getElementById("action_sub").value;
  const actionValue = document.getElementById("action_detail").value || "";

  const payload = {
    name,
    triggers: [{ type: `${triggerCategory}:${triggerSub}`, value: triggerValue }],
    conditions,
    actions: [{ category: actionCategory, sub: actionSub, detail: actionValue }]
  };

  try {
    const res = await fetch(id ? `/api/custom_orders/${id}` : "/api/custom_orders", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    const msgEl = document.getElementById("message");
    msgEl.textContent = data.message || "登録できました";
    msgEl.style.color = "green";
    setTimeout(() => { msgEl.textContent = ""; }, 3000);

    if (id) document.getElementById("command-id")?.remove();

    // フォームリセット
    document.getElementById("name").value = "";
    document.getElementById("trigger_category").value = "";
    document.getElementById("trigger_sub").innerHTML = "<option value=''>選択してください</option>";
    document.getElementById("trigger_value").value = "";
    document.getElementById("condition_blocks").innerHTML = "";
    document.getElementById("action_category").value = "";
    document.getElementById("action_sub").value = "";
    document.getElementById("action_detail").value = "";

    loadCommands();
  } catch (err) {
    console.error(err);
    const msgEl = document.getElementById("message");
    msgEl.textContent = "登録に失敗しました";
    msgEl.style.color = "red";
  }
}

// --------------------
// 命令一覧取得（編集・削除対応）
// --------------------
async function loadCommands() {
  const res = await fetch("/api/custom_orders");
  const list = await res.json();
  const container = document.getElementById("command-list");
  container.innerHTML = "";

  if (!list.length) {
    container.innerHTML = "<p>登録された命令はありません。</p>";
    return;
  }

  list.forEach(cmd => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `<b>${cmd.name}</b> (ID:${cmd.id})<br/>
      <small>条件: ${JSON.stringify(cmd.conditions)}</small><br/>
      <small>アクション: ${JSON.stringify(cmd.actions)}</small>
    `;

    const editBtn = document.createElement("button");
    editBtn.className = "nest-button";
    editBtn.innerText = "編集";
    editBtn.onclick = () => loadCommandToForm(cmd);
    div.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "remove";
    delBtn.innerText = "削除";
    delBtn.onclick = async () => {
      if (confirm("削除しますか？")) {
        await fetch(`/api/custom_orders/${cmd.id}`, { method: "DELETE" });
        loadCommands();
      }
    };
    div.appendChild(delBtn);

    container.appendChild(div);
  });
}

// --------------------
// 初期化
// --------------------
document.addEventListener("DOMContentLoaded", () => {
  populateSelect("trigger_category", TRIGGER_CATEGORIES);
  populateSelect("action_category", ACTION_CATEGORIES);

  document.getElementById("trigger_category").addEventListener("change", () =>
    updateSubOptions("trigger_category", "trigger_sub", TRIGGER_CATEGORIES)
  );
  document.getElementById("action_category").addEventListener("change", () =>
    updateSubOptions("action_category", "action_sub", ACTION_CATEGORIES)
  );

  document.getElementById("add-condition").addEventListener("click", () => addConditionBlock());
  document.getElementById("register-btn").addEventListener("click", registerCommand);

  loadCommands();
});
