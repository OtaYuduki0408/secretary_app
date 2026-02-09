// categories.js
document.addEventListener("DOMContentLoaded", () => {
    // --- 要素の取得 ---
    const input = document.getElementById("cat-input");
    const typeSelect = document.getElementById("cat-type"); 
    const addBtn = document.getElementById("cat-add");
    const clearBtn = document.getElementById("cat-clear");
    const list = document.getElementById("cat-list");
    const empty = document.getElementById("cat-empty");

    // 初期表示
    loadCategories();

    // ----------------------------------------------------
    // データ取得と描画
    // ----------------------------------------------------
    async function loadCategories() {
        const res = await fetch("/api/categories");
        if (!res.ok) {
            console.error("API Error:", res.statusText);
            alert("カテゴリの読み込み中にエラーが発生しました。");
            return;
        }
        const data = await res.json();
        renderCategories(data);
    }

    // ----------------------------------------------------
    // データ追加
    // ----------------------------------------------------
    async function addCategory() {
        const name = input.value.trim();
        const type = typeSelect.value;
        


        const payload = { name, type }; 
        
        const res = await fetch("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload) 
        });
        
        const data = await res.json();
        if (data.error) {
            alert(data.error);
        } else {
             input.value = "";
             // ★ 成功後、再読み込み
             loadCategories(); 
        }
    }

    // ----------------------------------------------------
    // 個別削除
    // ----------------------------------------------------
    async function deleteCategory(id) {
        if (!confirm("本当にこのカテゴリを削除しますか？")) return;
        
        await fetch(`/api/categories/${id}`, { method: "DELETE" });
        
        // ★ 削除後、再読み込み
        loadCategories(); 
    }

    // ----------------------------------------------------
    // 全削除
    // ----------------------------------------------------
    async function clearAll() {
        if (confirm("本当に全ての種類を削除しますか？")) {
            await fetch("/api/categories/clear", { method: "DELETE" });
            
            // ★ 全削除後、再読み込み
            loadCategories(); 
        }
    }

    // ----------------------------------------------------
    // カテゴリ一覧の描画
    // ----------------------------------------------------
    function renderCategories(items) {
        list.innerHTML = "";
        if (!items || items.length === 0) {
            empty.style.display = "block";
            return;
        }
        empty.style.display = "none";
        
        items.forEach(cat => {
            const typeText = cat.type === 'income' ? ' (収入)' : ' (支出)';
            const typeClass = cat.type === 'income' ? 'chip income' : 'chip expense'; 
            
            const div = document.createElement("div");
            div.className = typeClass;
            div.innerHTML = `
                ${cat.name} ${typeText}
                <button class="delete" data-id="${cat.id}">×</button>
            `;
            
            // イベントリスナーを設定
            div.querySelector('.delete').addEventListener('click', () => deleteCategory(cat.id));
            
            list.appendChild(div);
        });
    }

    // ----------------------------------------------------
    // イベントリスナー設定
    // ----------------------------------------------------
    addBtn.addEventListener("click", addCategory);
    clearBtn.addEventListener("click", clearAll);
    
    // Enterキーでも追加できるようにする
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addCategory();
        }
    });
});