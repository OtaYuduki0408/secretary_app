document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("cat-input");
    const typeSelect = document.getElementById("cat-type");
    const addBtn = document.getElementById("cat-add");
    const clearBtn = document.getElementById("cat-clear");
    const list = document.getElementById("cat-list");
    const empty = document.getElementById("cat-empty");

    const container = document.getElementById("cat-data");
    let categories = JSON.parse(container.dataset.categories || "[]");

    renderCategories(categories);

    // カテゴリ追加
    addBtn.addEventListener("click", async () => {
        const name = input.value.trim();
        const type = typeSelect.value;
        if (!name) return alert("名前を入力してください。");

        if (categories.some(c => c.name === name && c.type === type)) {
            return alert("同名・同タイプのカテゴリはすでに存在します。");
        }

        try {
            const res = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, type })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "追加失敗");

            categories.push(data.data[0]);
            input.value = "";
            renderCategories(categories);
        } catch (err) {
            alert(err.message);
        }
    });

    // 全削除
    clearBtn.addEventListener("click", async () => {
        if (!confirm("本当に全ての種類を削除しますか？")) return;
        try {
            const res = await fetch("/api/categories/clear", { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "削除失敗");

            categories = [];
            renderCategories(categories);
        } catch (err) {
            alert(err.message);
        }
    });

    // 個別削除
    async function deleteCategory(id) {
        if (!confirm("削除しますか？")) return;
        try {
            const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "削除失敗");

            categories = categories.filter(c => c.id !== id);
            renderCategories(categories);
        } catch (err) {
            alert(err.message);
        }
    }

    function renderCategories(items) {
        list.innerHTML = "";
        if (!items || items.length === 0) {
            empty.style.display = "block";
            return;
        }
        empty.style.display = "none";

        items.forEach(cat => {
            const typeText = cat.type === "income" ? " (収入)" : " (支出)";
            const typeClass = cat.type === "income" ? "chip income" : "chip expense";

            const div = document.createElement("div");
            div.className = typeClass;
            div.innerHTML = `
                ${cat.name} ${typeText}
                <button class="delete" data-id="${cat.id}">×</button>
            `;
            div.querySelector(".delete").addEventListener("click", () => deleteCategory(cat.id));
            list.appendChild(div);
        });
    }
});
