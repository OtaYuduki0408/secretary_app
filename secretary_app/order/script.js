// =============================================
//  edit_command.html 対応スクリプト（複数トリガー対応）
// =============================================

document.addEventListener("DOMContentLoaded", () => {
    const addButton = document.getElementById("add-button");
    const addOptions = document.getElementById("add-options");
    const canvas = document.getElementById("canvas");

    let nodeCounter = 0;
    let nodes = [];

    // -----------------------------------------
    // [+] ボタンのクリックでオプションメニュー表示
    // -----------------------------------------
    addButton.addEventListener("click", () => {
        addOptions.classList.toggle("hidden");
    });

    // -----------------------------------------
    // オプションボタンのクリック（トリガー / 条件 / 命令）
    // -----------------------------------------
    document.querySelectorAll(".option-button").forEach(button => {
        button.addEventListener("click", () => {
            const type = button.dataset.type;
            addNode(type);
            addOptions.classList.add("hidden");
        });
    });

    // -----------------------------------------
    // ノード追加関数
    // -----------------------------------------
    function addNode(type) {
        const node = document.createElement("div");
        node.className = `node ${type}`;
        node.dataset.id = ++nodeCounter;
        node.dataset.type = type;

        const title = document.createElement("h3");
        title.textContent = getNodeTitle(type);
        node.appendChild(title);

        // ---- フォーム領域 ----
        const content = document.createElement("div");
        content.className = "content";

        if (type === "trigger") {
            content.innerHTML = `
                <label>トリガータイプ:</label>
                <select class="trigger-type">
                    <option value="voice">音声</option>
                    <option value="time">時間</option>
                    <option value="gps">位置情報</option>
                </select><br>
                <label>値:</label>
                <input type="text" class="trigger-value" placeholder="例: 'おはよう' or 07:00 or 35.6,139.7,300">
            `;
        } 
        else if (type === "condition") {
            content.innerHTML = `
                <label>条件式:</label>
                <input type="text" class="condition-value" placeholder="例: weather == '晴れ'">
            `;
        } 
        else if (type === "action") {
            content.innerHTML = `
                <label>命令内容:</label>
                <textarea class="action-text" placeholder="実行する内容を入力"></textarea>
            `;
        } 
        else if (type === "and" || type === "or") {
            content.innerHTML = `
                <p class="logic-symbol">${type.toUpperCase()}</p>
            `;
        }

        node.appendChild(content);

        // ---- 削除ボタン ----
        const del = document.createElement("button");
        del.textContent = "削除";
        del.className = "delete-button";
        del.addEventListener("click", () => {
            canvas.removeChild(node);
            nodes = nodes.filter(n => n.id !== node.dataset.id);
        });
        node.appendChild(del);

        // ---- ノード追加 ----
        canvas.appendChild(node);
        nodes.push({ id: node.dataset.id, type });
    }

    // -----------------------------------------
    // ノードタイトル取得
    // -----------------------------------------
    function getNodeTitle(type) {
        switch (type) {
            case "trigger": return "トリガー設定";
            case "condition": return "条件設定";
            case "action": return "命令内容";
            case "and": return "AND";
            case "or": return "OR";
            default: return "不明";
        }
    }

    // -----------------------------------------
    // 保存ボタン（存在する場合）
    // -----------------------------------------
    const saveButton = document.getElementById("save-button");
    if (saveButton) {
        saveButton.addEventListener("click", () => {
            const orderName = prompt("命令の名前を入力してください:");
            if (!orderName) return alert("命令名は必須です。");

            // ノードをJSON構造に変換
            const orderData = {
                name: orderName,
                triggers: [],
                conditions: [],
                actions: [],
                logic: []
            };

            document.querySelectorAll(".node").forEach(node => {
                const type = node.dataset.type;

                if (type === "trigger") {
                    orderData.triggers.push({
                        trigger_type: node.querySelector(".trigger-type").value,
                        trigger_value: node.querySelector(".trigger-value").value
                    });
                }
                else if (type === "condition") {
                    orderData.conditions.push({
                        condition_value: node.querySelector(".condition-value").value
                    });
                }
                else if (type === "action") {
                    orderData.actions.push({
                        action_text: node.querySelector(".action-text").value
                    });
                }
                else if (type === "and" || type === "or") {
                    orderData.logic.push(type);
                }
            });

            // デバッグ確認
            console.log("送信データ:", orderData);

            // Flask APIへ送信
            fetch("/api/custom_orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderData)
            })
            .then(res => res.json())
            .then(data => {
                alert("✅ 登録完了: " + data.message);
            })
            .catch(err => {
                console.error("送信エラー:", err);
                alert("⚠️ 登録に失敗しました。");
            });
        });
    }
});
