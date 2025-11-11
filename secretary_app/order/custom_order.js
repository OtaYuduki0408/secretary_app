//------------------------------------------------------
// custom_order.js - 命令登録・一覧管理スクリプト
//------------------------------------------------------

// --------------------
// 命令一覧の取得・表示
// --------------------
async function loadCommands() {
  try {
    const res = await fetch("/api/custom_orders");
    const commands = await res.json();

    const list = document.getElementById("command-list");
    list.innerHTML = "";

    if (commands.length === 0) {
      list.innerHTML = "<p>登録された命令はありません。</p>";
      return;
    }

    commands.forEach((cmd) => {
      const item = document.createElement("div");
      item.className = "command-item";
      item.innerHTML = `
        <div class="command-info">
          <strong>${cmd.name}</strong><br/>
          <span>動作: ${cmd.action_type} → ${cmd.content}</span><br/>
          <span>トリガー: ${cmd.trigger_type} (${cmd.trigger_value || "なし"})</span><br/>
          <span>条件: ${cmd.condition_expr || "なし"}</span><br/>
          <span>破棄条件: ${cmd.break_expr || "なし"}</span><br/>
          <span>ループ: ${cmd.loop_count || "once"}</span>
        </div>
        <button class="delete-btn" data-id="${cmd.id}">削除</button>
      `;
      list.appendChild(item);
    });

    // 削除ボタンイベント登録
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (confirm(`命令(ID=${id})を削除しますか？`)) {
          await deleteCommand(id);
          loadCommands();
        }
      });
    });
  } catch (err) {
    console.error("命令一覧の取得に失敗:", err);
  }
}

// --------------------
// 命令削除
// --------------------
async function deleteCommand(id) {
  const res = await fetch(`/api/custom_orders/${id}`, { method: "DELETE" });
  const data = await res.json();
  console.log(data.message);
}

// --------------------
// 命令登録処理
// --------------------
async function registerCommand() {
  const name = document.getElementById("name").value;
  const actionType = document.getElementById("action_type").value;
  const content = document.getElementById("content").value;
  const triggerType = document.getElementById("trigger_type").value;
  const triggerValue = document.getElementById("trigger_value").value;
  const conditionExpr = document.getElementById("condition_expr").value;
  const breakExpr = document.getElementById("break_expr").value;
  const loopCount = document.getElementById("loop_count").value;

  if (!name || !content) {
    alert("命令名と内容は必須です。");
    return;
  }

  const payload = {
    name,
    actions: [{ type: actionType, value: content }],
    triggers: [{ type: triggerType, value: triggerValue }],
    conditions: conditionExpr ? [{ expr: conditionExpr }] : [],
    break_conditions: breakExpr ? [{ expr: breakExpr }] : [],
    loop_count: loopCount
  };

  try {
    const res = await fetch("/api/custom_orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    alert(data.message);
    loadCommands();
  } catch (err) {
    console.error("登録エラー:", err);
  }
}

// --------------------
// 初期化
// --------------------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("register-btn").addEventListener("click", registerCommand);
  loadCommands();
});
