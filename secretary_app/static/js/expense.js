document.addEventListener("DOMContentLoaded", () => {
  const amountEl = document.getElementById("amount");
  const memoEl = document.getElementById("memo");
  const catEl = document.getElementById("category");
  const noCatEl = document.getElementById("no-cat");
  const saveBtn = document.getElementById("save");
  const tbody = document.querySelector("#records tbody");

  // --- カテゴリ読み込み ---
  async function loadCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();

    catEl.innerHTML = "";
    if (!data || data.length === 0) {
      catEl.style.display = "none";
      noCatEl.style.display = "block";
      return;
    }

    noCatEl.style.display = "none";
    catEl.style.display = "block";
    data.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      catEl.appendChild(opt);
    });
  }

  // --- 収支一覧読み込み ---
  async function loadRecords() {
    const res = await fetch("/api/finance");
    const data = await res.json();
    tbody.innerHTML = "";

    if (!Array.isArray(data)) return;

    data.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${r.type === "income" ? "収入" : "支出"}</td>
        <td>${r.category}</td>
        <td>${Number(r.amount).toLocaleString()}円</td>
        <td>${r.memo || ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- 登録 ---
  async function saveFinance() {
    const type = document.querySelector("input[name='type']:checked").value;
    const category = catEl.value;
    const amount = Number(amountEl.value);
    const memo = memoEl.value.trim();

    if (!amount || !category) {
      alert("金額と種類を入力してください。");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const payload = { date: today, type, category, amount, memo };

    const res = await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.error) {
      alert(data.error);
    } else {
      alert("登録しました！");
      amountEl.value = "";
      memoEl.value = "";
      loadRecords();
    }
  }

  saveBtn.addEventListener("click", saveFinance);

  // 初期ロード
  loadCategories();
  loadRecords();
});
