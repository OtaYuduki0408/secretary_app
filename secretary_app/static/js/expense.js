document.addEventListener("DOMContentLoaded", () => {
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

  const editOverlay = document.getElementById("expense-edit-overlay");
  const editDateEl = document.getElementById("edit-date");
  const editTypeEl = document.getElementById("edit-type");
  const editCategoryEl = document.getElementById("edit-category");
  const editAmountEl = document.getElementById("edit-amount");
  const editMemoEl = document.getElementById("edit-memo");
  const editSaveBtn = document.getElementById("expense-edit-save");
  const editCancelBtn = document.getElementById("expense-edit-cancel");

  const state = {
    type: "expense",
    category: null,
    allCategories: [],
    records: [],
    isDeleteMode: false,
    editingRecordId: null,
  };

  const formatYen = (value) => Number(value || 0).toLocaleString();

  function normalizeDateForDisplay(value) {
    if (!value) return "";
    const s = String(value).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return `${m[1]} ${m[2]}:${m[3]}`;
    return s;
  }

  function toDateTimeLocalValue(value) {
    if (!value) return "";
    const s = String(value).trim().replace(" ", "T");
    const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (!m) return "";
    return `${m[1]}T${m[2]}:${m[3]}`;
  }

  function fromDateTimeLocalValue(value) {
    if (!value) return "";
    return `${value.replace("T", " ")}:00`;
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "error" : ""}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categories");
      return await res.json();
    } catch (err) {
      showToast("カテゴリの読み込みに失敗しました。", true);
      return [];
    }
  }

  async function fetchSummary() {
    try {
      const res = await fetch("/api/finance/summary");
      if (!res.ok) throw new Error("failed to fetch summary");
      const data = await res.json();
      balanceEl.textContent = formatYen(data.balance);
      monthlyEl.textContent = formatYen(data.monthly_expense);
      dailyEl.textContent = formatYen(data.daily_expense);
    } catch (err) {
      console.warn("[expense] summary fetch failed", err);
    }
  }

  async function fetchRecords() {
    try {
      const res = await fetch("/api/finance");
      return await res.json();
    } catch (err) {
      showToast("記録の読み込みに失敗しました。", true);
      return [];
    }
  }

  function getCategoriesByType(type) {
    if (!Array.isArray(state.allCategories)) return [];
    const byType = state.allCategories.filter((c) => c && c.type === type);
    return byType.length > 0 ? byType : state.allCategories;
  }

  function renderCategoryButtons() {
    categoryButtons.innerHTML = "";
    const filteredCategories = getCategoriesByType(state.type);

    if (!filteredCategories || filteredCategories.length === 0) {
      categoryButtons.style.display = "none";
      noCatEl.style.display = "block";
      return;
    }

    categoryButtons.style.display = "flex";
    noCatEl.style.display = "none";

    filteredCategories.forEach((c) => {
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

  function syncModeUI() {
    recordsTable.classList.toggle("delete-mode", state.isDeleteMode);
    executeDeleteBtn.style.display = state.isDeleteMode ? "block" : "none";
    deleteModeBtn.textContent = state.isDeleteMode ? "削除終了" : "削除モード";

    document.querySelectorAll(".checkbox-col").forEach((col) => {
      col.style.display = state.isDeleteMode ? "table-cell" : "none";
    });
    if (!state.isDeleteMode) {
      selectAllCheckbox.checked = false;
      document.querySelectorAll(".record-checkbox").forEach((cb) => (cb.checked = false));
    }
  }

  function renderEditCategoryOptions(type, selectedCategory) {
    const categories = getCategoriesByType(type);
    editCategoryEl.innerHTML = "";
    categories.forEach((c) => {
      const option = document.createElement("option");
      option.value = c.name;
      option.textContent = c.name;
      editCategoryEl.appendChild(option);
    });
    if (selectedCategory) {
      editCategoryEl.value = selectedCategory;
      if (editCategoryEl.value !== selectedCategory) {
        const custom = document.createElement("option");
        custom.value = selectedCategory;
        custom.textContent = selectedCategory;
        editCategoryEl.appendChild(custom);
        editCategoryEl.value = selectedCategory;
      }
    }
  }

  function openEditOverlay(record) {
    state.editingRecordId = record.id;
    editDateEl.value = toDateTimeLocalValue(record.date);
    editTypeEl.value = record.type || "expense";
    renderEditCategoryOptions(editTypeEl.value, record.category || "");
    editAmountEl.value = Number(record.amount || 0);
    editMemoEl.value = record.memo || "";
    editOverlay.hidden = false;
  }

  function closeEditOverlay() {
    editOverlay.hidden = true;
    state.editingRecordId = null;
  }

  function renderRecords(records) {
    recordsTbody.innerHTML = "";
    if (!Array.isArray(records)) return;

    records.forEach((r) => {
      const tr = document.createElement("tr");
      tr.classList.add(r.type === "income" ? "income-row" : "expense-row");
      tr.innerHTML = `
        <td class="checkbox-col" style="display: ${state.isDeleteMode ? "table-cell" : "none"};">
          <input type="checkbox" class="record-checkbox" data-id="${r.id}">
        </td>
        <td>${normalizeDateForDisplay(r.date)}</td>
        <td>${r.type === "income" ? "収入" : "支出"}</td>
        <td>${r.category || ""}</td>
        <td>${Number(r.amount).toLocaleString()}円</td>
        <td>${r.memo || ""}</td>
      `;
      tr.addEventListener("click", (event) => {
        if (state.isDeleteMode) return;
        if (event.target.closest(".record-checkbox")) return;
        openEditOverlay(r);
      });
      recordsTbody.appendChild(tr);
    });
  }

  function handleTypeChange(e) {
    const selectedType = e.target.dataset.value;
    if (!selectedType) return;
    state.type = selectedType;
    state.category = null;
    typeSelector.querySelectorAll(".btn-type").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === selectedType);
    });
    renderCategoryButtons();
  }

  async function handleSave() {
    const amount = Number(amountEl.value);
    const memo = memoEl.value.trim();
    if (!amount || !state.category) {
      showToast("金額と種類を選択してください。", true);
      return;
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");

    const payload = {
      date: `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`,
      type: state.type,
      category: state.category,
      amount,
      memo,
    };

    const res = await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
      return;
    }

    showToast("登録しました！");
    amountEl.value = "";
    memoEl.value = "";
    state.category = null;
    renderCategoryButtons();
    loadData();
  }

  function toggleDeleteMode() {
    state.isDeleteMode = !state.isDeleteMode;
    syncModeUI();
    renderRecords(state.records);
  }

  async function bulkDeleteRecords() {
    const selectedIds = [...document.querySelectorAll(".record-checkbox:checked")].map((cb) => cb.dataset.id);
    if (selectedIds.length === 0) {
      showToast("削除する項目を選択してください。", true);
      return;
    }

    const res = await fetch("/api/finance/bulk-delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
      return;
    }

    showToast(`${selectedIds.length}件の記録を削除しました。`);
    state.isDeleteMode = false;
    syncModeUI();
    loadData();
  }

  async function saveEditRecord() {
    if (!state.editingRecordId) return;
    const payload = {
      date: fromDateTimeLocalValue(editDateEl.value),
      type: editTypeEl.value,
      category: editCategoryEl.value,
      amount: Number(editAmountEl.value || 0),
      memo: editMemoEl.value.trim(),
    };
    if (!payload.date || !payload.category || !payload.amount) {
      showToast("日時・種類・金額を入力してください。", true);
      return;
    }

    const res = await fetch(`/api/finance/${state.editingRecordId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
      return;
    }

    showToast("更新しました。");
    closeEditOverlay();
    loadData();
  }

  function handleSelectAll(e) {
    document.querySelectorAll(".record-checkbox").forEach((checkbox) => {
      checkbox.checked = e.target.checked;
    });
  }

  async function loadData() {
    const [categories, records] = await Promise.all([fetchCategories(), fetchRecords()]);
    state.allCategories = Array.isArray(categories) ? categories : [];
    state.records = Array.isArray(records) ? records : [];
    renderCategoryButtons();
    syncModeUI();
    renderRecords(state.records);
    fetchSummary();
  }

  editTypeEl?.addEventListener("change", () => {
    renderEditCategoryOptions(editTypeEl.value, "");
  });
  editSaveBtn?.addEventListener("click", saveEditRecord);
  editCancelBtn?.addEventListener("click", closeEditOverlay);
  editOverlay?.addEventListener("click", (e) => {
    if (e.target === editOverlay) closeEditOverlay();
  });

  typeSelector.addEventListener("click", handleTypeChange);
  saveBtn.addEventListener("click", handleSave);
  deleteModeBtn.addEventListener("click", toggleDeleteMode);
  executeDeleteBtn.addEventListener("click", bulkDeleteRecords);
  selectAllCheckbox.addEventListener("click", handleSelectAll);

  loadData();
});
