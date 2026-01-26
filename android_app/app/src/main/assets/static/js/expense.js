document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const balanceEl = document.getElementById("balance");
  const monthlyEl = document.getElementById("monthly");
  const dailyEl = document.getElementById("daily");
  const amountEl = document.getElementById("amount");
  const memoEl = document.getElementById("memo");
  const saveBtn = document.getElementById("save");
  const recordsTbody = document.querySelector("#records tbody");
  const typeSelector = document.getElementById("type-selector");
  const categoryButtons = document.getElementById("category-buttons");
  const noCatEl = document.getElementById("no-cat");
  const toastContainer = document.getElementById("toast-container");
  const deleteModeBtn = document.getElementById("delete-mode-btn");
  const executeDeleteBtn = document.getElementById("execute-delete-btn");
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  const recordsTable = document.getElementById("records");

  // --- State ---
  const state = {
    type: "expense", // 'income' or 'expense'
    category: null,
    allCategories: [],
    isDeleteMode: false,
  };

  const formatYen = (value) => Number(value || 0).toLocaleString();

  // --- Toast Notification ---
  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "error" : ""}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- API Functions ---
  async function localApiRequest(method, url, body = null) {
    console.log(`[localApiRequest] ${method} ${url}`, body);
    if (!window.AndroidSync?.request) {
      console.error("AndroidSync.request is not available");
      throw new Error("AndroidSync bridge not found");
    }
    const rawResponse = await window.AndroidSync.request(method, url, body ? JSON.stringify(body) : null);
    console.log(`[localApiRequest] Raw response for ${url}:`, rawResponse);
    const response = JSON.parse(rawResponse);
    if (response.status >= 400) {
      throw new Error(`API Error: ${response.status} ${response.body?.error}`);
    }
    return response.body;
  }


  async function fetchCategories() {
    try {
      console.log("Fetching categories from /api/categories");
      const data = await localApiRequest("GET", "/api/categories");
      console.log("Categories fetched:", data);
      return data;
    } catch (err) {
      showToast("カテゴリの読み込みに失敗しました。", true);
      console.error("Failed to fetch categories:", err);
      return [];
    }
  }

  async function fetchSummary() {
    try {
      console.log("Fetching summary from /api/finance/summary");
      const data = await localApiRequest("GET", "/api/finance/summary");
      console.log("Summary fetched:", data);
      balanceEl.textContent = formatYen(data.balance);
      monthlyEl.textContent = formatYen(data.monthly_expense);
      dailyEl.textContent = formatYen(data.daily_expense);
    } catch (err) {
      console.warn("[expense] summary fetch failed", err);
      balanceEl.textContent = "エラー";
      monthlyEl.textContent = "エラー";
      dailyEl.textContent = "エラー";
    }
  }

  async function fetchRecords() {
    try {
      console.log("Fetching records from /api/finance");
      const data = await localApiRequest("GET", "/api/finance");
      console.log("Records fetched:", data);
      return data;
    } catch (err) {
      showToast("記録の読み込みに失敗しました。", true);
      console.error("Failed to fetch records:", err);
      return [];
    }
  }

  // --- UI Rendering ---
  function renderCategoryButtons() {
    categoryButtons.innerHTML = "";
    // Temporarily show all categories until type is associated with category
    const filteredCategories = state.allCategories; 
    // const filteredCategories = state.allCategories.filter(c => c.type === state.type);

    if (!filteredCategories || filteredCategories.length === 0) {
      categoryButtons.style.display = "none";
      noCatEl.style.display = "block";
      return;
    }

    categoryButtons.style.display = "flex";
    noCatEl.style.display = "none";

    filteredCategories.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "btn-category";
      btn.dataset.value = c.name;
      btn.textContent = c.name;
      if (state.category === c.name) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => {
        state.category = c.name;
        renderCategoryButtons();
      });
      categoryButtons.appendChild(btn);
    });
  }

  function renderRecords(records) {
    recordsTbody.innerHTML = "";
    if (!Array.isArray(records)) return;

    records.forEach(r => {
      const tr = document.createElement("tr");
      tr.classList.add(r.type === "income" ? "income-row" : "expense-row");
      tr.innerHTML = `
        <td class="checkbox-col" style="display: ${state.isDeleteMode ? 'table-cell' : 'none'};">
          <input type="checkbox" class="record-checkbox" data-id="${r.id}">
        </td>
        <td>${r.date}</td>
        <td>${r.type === "income" ? "収入" : "支出"}</td>
        <td>${r.category}</td>
        <td>${Number(r.amount).toLocaleString()}円</td>
        <td>${r.memo || ""}</td>
      `;
      recordsTbody.appendChild(tr);
    });
  }

  // --- Event Handlers ---
  function handleTypeChange(e) {
    const selectedType = e.target.dataset.value;
    if (selectedType) {
      state.type = selectedType;
      state.category = null; // Reset category selection
      typeSelector.querySelectorAll(".btn-type").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === selectedType);
      });
      renderCategoryButtons();
    }
  }

  async function handleSave() {
    const amount = Number(amountEl.value);
    const memo = memoEl.value.trim();

    if (!amount || !state.category) {
      showToast("金額と種類を選択してください。", true);
      return;
    }

    const payload = {
      date: new Date().toISOString().split("T")[0],
      type: state.type,
      category: state.category,
      amount,
      memo,
    };

    try {
      const data = await localApiRequest("POST", "/api/finance", payload);
      showToast("登録しました！");
      amountEl.value = "";
      memoEl.value = "";
      state.category = null;
      renderCategoryButtons();
      loadData();
    } catch(err) {
        showToast(err.message, true);
    }
  }

  function toggleDeleteMode() {
    state.isDeleteMode = !state.isDeleteMode;
    recordsTable.classList.toggle("delete-mode", state.isDeleteMode);
    executeDeleteBtn.style.display = state.isDeleteMode ? "block" : "none";
    deleteModeBtn.textContent = state.isDeleteMode ? "完了" : "削除モード";
    document.querySelectorAll(".checkbox-col").forEach(col => {
      col.style.display = state.isDeleteMode ? "table-cell" : "none";
    });
    if (!state.isDeleteMode) {
      selectAllCheckbox.checked = false;
      document.querySelectorAll('.record-checkbox').forEach(cb => cb.checked = false);
    }
  }

  async function bulkDeleteRecords() {
    const selectedIds = [...document.querySelectorAll(".record-checkbox:checked")].map(cb => cb.dataset.id);
    if (selectedIds.length === 0) {
      showToast("削除する項目を選択してください。", true);
      return;
    }

    try {
      await localApiRequest("DELETE", "/api/finance/bulk-delete", { ids: selectedIds });
      showToast(`${selectedIds.length}件の記録を削除しました。`);
      toggleDeleteMode(); // Exit delete mode
      loadData();
    } catch(err) {
        showToast(err.message, true);
    }
  }

  function handleSelectAll(e) {
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });
  }

  // --- Initial Load ---
  async function loadData() {
    balanceEl.textContent = "読み込み中...";
    monthlyEl.textContent = "読み込み中...";
    dailyEl.textContent = "読み込み中...";
    recordsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">読み込み中...</td></tr>';

    const [categories, records] = await Promise.all([fetchCategories(), fetchRecords()]);
    state.allCategories = categories;
    renderCategoryButtons();
    renderRecords(records);
    fetchSummary(); // No need to wait for this one
  }

  // --- Event Listeners ---
  typeSelector.addEventListener("click", handleTypeChange);
  saveBtn.addEventListener("click", handleSave);
  deleteModeBtn.addEventListener("click", toggleDeleteMode);
  executeDeleteBtn.addEventListener("click", bulkDeleteRecords);
  selectAllCheckbox.addEventListener("click", handleSelectAll);

  loadData();
});
