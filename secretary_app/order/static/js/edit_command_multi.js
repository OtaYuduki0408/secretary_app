document.addEventListener("DOMContentLoaded", () => {
  const addButton = document.getElementById("add-button");
  const addOptions = document.getElementById("add-options");
  const canvas = document.getElementById("canvas");
  const form = document.getElementById("command-form");

  // 「＋」ボタンでメニュー表示
  addButton.addEventListener("click", () => {
    addOptions.classList.toggle("hidden");
  });

  // トリガー・条件・命令追加
  document.querySelectorAll(".option-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      addOptions.classList.add("hidden");

      const block = document.createElement("div");
      block.className = "block " + type;

      if(type==="trigger") {
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
      }
      if(type==="condition") {
        block.innerHTML = `
          <h3>条件</h3>
          <input type="text" name="condition_expr[]" placeholder="例: weather == '晴れ'">
        `;
      }
      if(type==="action") {
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
          <input type="text" name="action_value[]" placeholder="例: おはようございます！">
        `;
      }

      canvas.appendChild(block);
    });
  });

  // 保存処理（複数命令登録）
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const payload = [{
      name: form.querySelector("#command-name").value,
      triggers: [],
      conditions: [],
      actions: []
    }];

    canvas.querySelectorAll(".trigger").forEach(b => {
      payload[0].triggers.push({
        type: b.querySelector("select[name='trigger_type[]']").value,
        value: b.querySelector("input[name='trigger_value[]']").value
      });
    });
    canvas.querySelectorAll(".condition").forEach(b => {
      payload[0].conditions.push({
        expr: b.querySelector("input[name='condition_expr[]']").value
      });
    });
    canvas.querySelectorAll(".action").forEach(b => {
      payload[0].actions.push({
        type: b.querySelector("select[name='action_type[]']").value,
        value: b.querySelector("input[name='action_value[]']").value
      });
    });

    const res = await fetch("/api/custom_orders_multi", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });

    if(res.ok){
      alert("✅ 命令を保存しました");
      location.href="/";
    } else {
      alert("❌ 保存に失敗しました");
    }
  });
});
