document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("add-button");
  const addOptions = document.getElementById("add-options");
  const canvas = document.getElementById("canvas");
  const form = document.getElementById("command-form");

  // + ボタンでオプション表示切替
  addButton.addEventListener("click", () => {
    addOptions.classList.toggle("hidden");
  });

  // 各オプション追加
  document.querySelectorAll(".option-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      addOptions.classList.add("hidden");

      if (type === "trigger") {
        const block = document.createElement("div");
        block.className = "block trigger";
        block.innerHTML = `
          <h3>トリガー</h3>
          <label>タイプ:</label>
          <select name="trigger_type[]">
            <option value="voice">音声</option>
            <option value="time">時刻</option>
            <option value="gps">GPS</option>
          </select>
          <br>
          <label>値:</label>
          <input type="text" name="trigger_value[]" placeholder="例: おはよう / 07:00 / 座標など">
        `;
        canvas.appendChild(block);
      }

      if (type === "condition") {
        const block = document.createElement("div");
        block.className = "block condition";
        block.innerHTML = `
          <h3>条件</h3>
          <input type="text" name="condition_expr[]" placeholder="例: weather == '晴れ'">
        `;
        canvas.appendChild(block);
      }

      if (type === "action") {
        const block = document.createElement("div");
        block.className = "block action";
        block.innerHTML = `
          <h3>命令</h3>
          <label>タイプ:</label>
          <select name="action_type[]">
            <option value="speak">発話</option>
            <option value="notify">通知</option>
            <option value="open_app">アプリ起動</option>
          </select>
          <br>
          <label>内容:</label>
          <input type="text" name="action_value[]" placeholder="例: 'おはようございます！'">
        `;
        canvas.appendChild(block);
      }
    });
  });

  // 保存処理
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("command-name").value.trim();
    if (!name) {
      alert("命令名を入力してください");
      return;
    }

    // 複数命令配列
    const payload = [];

    const triggers = Array.from(canvas.querySelectorAll(".trigger")).map(b => ({
      type: b.querySelector('select[name="trigger_type[]"]').value,
      value: b.querySelector('input[name="trigger_value[]"]').value
    }));

    const conditions = Array.from(canvas.querySelectorAll(".condition")).map(b => ({
      expr: b.querySelector('input[name="condition_expr[]"]').value
    }));

    const actions = Array.from(canvas.querySelectorAll(".action")).map(b => ({
      type: b.querySelector('select[name="action_type[]"]').value,
      value: b.querySelector('input[name="action_value[]"]').value
    }));

    // 1つの命令として登録
    payload.push({
      name: name,
      triggers: triggers,
      conditions: conditions,
      actions: actions
    });

    try {
      const res = await fetch("/api/custom_orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("✅ 命令を保存しました！");
        location.href = "/";
      } else {
        const err = await res.json();
        alert("❌ 保存に失敗しました: " + (err.message || res.statusText));
      }
    } catch (err) {
      alert("❌ 通信エラー: " + err.message);
    }
  });
});
