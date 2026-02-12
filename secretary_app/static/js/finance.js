/* =========================
   finance.js — 完全版 (最終・HTML依存解消版)
   ・**HTMLの<select>から size="5" を削除していることが前提**
   ・ホイールの項目高さを36px固定で計算
   ・中央寄せスクロールをsetTimeoutで強制
========================= */

// グローバル公開（ホイール側から呼ぶ）
let applyFiltersAndSort;

/* 日付を YYYY-MM-DD に正規化（2025/11/5, 2025-11-05 など許容） */
function normalizeDateToKey(s) {
  if (!s) return "";
  const m = String(s).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/);
  if (!m) return "";
  const y = m[1];
  const mo = String(m[2]).padStart(2, "0");
  const d = String(m[3]).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("finance-data");

  // ---------- データ取得 ----------
  let rawFinanceRecords = JSON.parse(container?.dataset.allRecords || "[]");

  // すべてのレコードへ dateKey を付与（内部比較用）
  rawFinanceRecords.forEach(r => {
    r.dateKey = normalizeDateToKey(r.date || "");
  });

  // ---------- 要素 ----------
  const financeTableBody = document.querySelector("#financeTable tbody");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const filterCategory = document.getElementById("filterCategory");
  const filterType = document.getElementById("filterType");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  const deleteModeBtn = document.getElementById("finance-delete-mode-btn");
  const executeDeleteBtn = document.getElementById("finance-execute-delete-btn");
  const selectAllCheckbox = document.getElementById("finance-select-all");
  const financeTable = document.getElementById("financeTable");
  const editOverlay = document.getElementById("finance-edit-overlay");
  const editYear = document.getElementById("finance-edit-year");
  const editMonth = document.getElementById("finance-edit-month");
  const editDay = document.getElementById("finance-edit-day");
  const editHour = document.getElementById("finance-edit-hour");
  const editMinute = document.getElementById("finance-edit-minute");
  const editType = document.getElementById("finance-edit-type");
  const editCategory = document.getElementById("finance-edit-category");
  const editAmount = document.getElementById("finance-edit-amount");
  const editMemo = document.getElementById("finance-edit-memo");
  const editSaveBtn = document.getElementById("finance-edit-save");
  const editCancelBtn = document.getElementById("finance-edit-cancel");

  let incomeChart = null;
  let expenseChart = null;
  let isDeleteMode = false;
  let editingRecordId = null;

  // ---------- カテゴリオプション構築 ----------
  let allCategories = [];
  function rebuildCategoryOptions() {
    allCategories = [...new Set(rawFinanceRecords.map((r) => r.category))].filter(Boolean);
    filterCategory.querySelectorAll('option:not([value="all"])').forEach((opt) => opt.remove());
    allCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      filterCategory.appendChild(option);
    });
  }
  rebuildCategoryOptions();

  function formatDateTimeDisplay(value) {
    if (!value) return "";
    const s = String(value).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return `${m[1]} ${m[2]}:${m[3]}`;
    const d = s.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (d) return `${d[1]} 00:00`;
    return s.replace("T", " ");
  }

  function parseDateParts(value) {
    const now = new Date();
    const fallback = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: 0,
      minute: 0,
    };
    if (!value) return fallback;
    const s = String(value).trim().replace("T", " ");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return fallback;
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4] || 0),
      minute: Number(m[5] || 0),
    };
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function buildDateTimeFromInputs() {
    const year = Number(editYear.value);
    const month = Number(editMonth.value);
    const day = Number(editDay.value);
    const hour = Number(editHour.value);
    const minute = Number(editMinute.value);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return "";
    if (month < 1 || month > 12) return "";
    if (day < 1 || day > 31) return "";
    if (hour < 0 || hour > 23) return "";
    if (minute < 0 || minute > 59) return "";
    return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:00`;
  }

  async function refreshRecordsFromApi() {
    const res = await fetch("/api/finance");
    if (!res.ok) throw new Error("finance fetch failed");
    rawFinanceRecords = await res.json();
    rawFinanceRecords.forEach((r) => {
      r.dateKey = normalizeDateToKey(r.date || "");
    });
    rebuildCategoryOptions();
  }

  function syncFinanceModeUi() {
    financeTable.classList.toggle("delete-mode", isDeleteMode);
    if (executeDeleteBtn) executeDeleteBtn.style.display = isDeleteMode ? "inline-flex" : "none";
    if (deleteModeBtn) deleteModeBtn.textContent = isDeleteMode ? "削除終了" : "削除モード";
    document.querySelectorAll(".fd-check-col").forEach((el) => {
      el.style.display = isDeleteMode ? "table-cell" : "none";
    });
    if (!isDeleteMode && selectAllCheckbox) {
      selectAllCheckbox.checked = false;
    }
  }

  function openFinanceEditOverlay(record) {
    editingRecordId = record.id;
    const parts = parseDateParts(record.date);
    editYear.value = parts.year;
    editMonth.value = parts.month;
    editDay.value = parts.day;
    editHour.value = parts.hour;
    editMinute.value = parts.minute;
    editType.value = record.type || "expense";
    editCategory.value = record.category || "";
    editAmount.value = Number(record.amount || 0);
    editMemo.value = record.memo || record.description || "";
    editOverlay.hidden = false;
  }

  function closeFinanceEditOverlay() {
    editOverlay.hidden = true;
    editingRecordId = null;
  }

  // ---------- テーブル描画 ----------
  function renderTable(data) {
    financeTableBody.innerHTML = "";
    if (data.length === 0) {
      financeTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 10px;">該当するデータがありません。</td></tr>';
      return;
    }

    data.forEach(record => {
      const row = financeTableBody.insertRow();
      row.classList.add(`type-${record.type}`);
      row.dataset.id = record.id;

      const checkCell = row.insertCell();
      checkCell.className = "fd-check-col";
      checkCell.style.display = isDeleteMode ? "table-cell" : "none";
      checkCell.innerHTML = `<input type="checkbox" class="finance-record-checkbox" data-id="${record.id}">`;

      // 表示は record.date があればそのまま、無ければ dateKey を / 表示
      const displayDate = formatDateTimeDisplay(record.date || (record.dateKey ? record.dateKey.replaceAll("-", "/") : ""));
      row.insertCell().textContent = displayDate;

      const typeCell = row.insertCell();
      typeCell.textContent = record.type === 'income' ? '収入' : '支出';
      typeCell.classList.add('fd-type-cell');
      typeCell.style.color = record.type === 'income' ? '#00bcd4' : '#e74c3c';

      row.insertCell().textContent = record.category ?? "";
      row.insertCell().textContent = record.memo ?? record.description ?? "";

      const amountCell = row.insertCell();
      amountCell.textContent = `${Number(record.amount || 0).toLocaleString()} 円`;
      amountCell.classList.add('fd-amount-cell');

      row.addEventListener("click", (event) => {
        if (isDeleteMode) return;
        if (event.target.closest(".finance-record-checkbox")) return;
        openFinanceEditOverlay(record);
      });
    });
  }

  // ---------- フィルタ & ソート ----------
  applyFiltersAndSort = function () {
    let currentData = [...rawFinanceRecords];

    // タイプ
    const selectedType = document.querySelector('input[name="typeFilter"]:checked')?.value || "all";
    if (selectedType !== "all") {
      currentData = currentData.filter(r => r.type === selectedType);
    }

    // カテゴリ（複数）
    const selectedOptions = Array.from(filterCategory.selectedOptions).map(o => o.value);
    if (!selectedOptions.includes("all") && selectedOptions.length > 0) {
      currentData = currentData.filter(r => selectedOptions.includes(r.category));
    }

    // 検索（内容/日付文字列）
    const searchTerm = (searchInput.value || "").toLowerCase();
    if (searchTerm) {
      currentData = currentData.filter(r =>
        (r.memo || "").toLowerCase().includes(searchTerm) ||
        (r.description || "").toLowerCase().includes(searchTerm) ||
        (r.date || "").includes(searchTerm)
      );
    }

    // 期間（YYYY-MM-DD で比較）
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    if (startDate) currentData = currentData.filter(r => (r.dateKey || "") >= startDate);
    if (endDate)   currentData = currentData.filter(r => (r.dateKey || "") <= endDate);

    // ソート
    const sortKey = sortSelect.value;
    currentData.sort((a, b) => {
      if (sortKey === "date") {
        return new Date(b.dateKey || 0) - new Date(a.dateKey || 0); // 降順
      } else if (sortKey === "amount") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      return 0;
    });

    renderTable(currentData);
    syncFinanceModeUi();
    updateCharts(currentData);
    updateSummary();
  };

  // ---------- グラフ ----------
  function updateCharts(records) {
    const currentIncomeRecords = records.filter(r => r.type === 'income');
    const currentExpenseRecords = records.filter(r => r.type === 'expense');
    drawIncomeChart(currentIncomeRecords);
    drawExpenseChart(currentExpenseRecords);
  }

            function drawIncomeChart(records) {

              const ctx = document.getElementById('incomeChart').getContext('2d');

              if (incomeChart) incomeChart.destroy();

          

              const categoryTotals = records.reduce((acc, r) => {

                const cat = r.category || "未分類";

                acc[cat] = (acc[cat] || 0) + Number(r.amount || 0);

                return acc;

              }, {});

          

              const labels = Object.keys(categoryTotals);

              const data = labels.map(l => categoryTotals[l]);

          

              incomeChart = new Chart(ctx, {

                type: 'bar',

                data: {

                  labels,

                  datasets: [{

                    label: '収入',

                    data,

                    backgroundColor: 'rgba(0, 188, 212, 0.8)',

                    borderColor: 'rgba(0, 188, 212, 1)',

                    borderWidth: 1

                  }]

                },

                options: {

                  responsive: true,

                  scales: {

                    y: {

                      beginAtZero: true

                    }

                  },

                  plugins: {

                    legend: {

                      display: false

                    },

                    title: {

                      display: true,

                      text: 'カテゴリ別収入'

                    }

                  }

                }

              });

            }

          

            function drawExpenseChart(records) {

              const ctx = document.getElementById('expenseChart').getContext('2d');

              if (expenseChart) expenseChart.destroy();

          

              const categoryTotals = records.reduce((acc, r) => {

                const cat = r.category || "未分類";

                acc[cat] = (acc[cat] || 0) + Number(r.amount || 0);

                return acc;

              }, {});

          

              const labels = Object.keys(categoryTotals);

              const data = labels.map(l => categoryTotals[l]);

              const backgroundColors = generateCategoryColors(labels);

          

              expenseChart = new Chart(ctx, {

                type: 'pie',

                data: {

                  labels: labels,

                  datasets: [{

                    data: data,

                    backgroundColor: Object.values(backgroundColors)

                  }]

                },

                options: {

                  responsive: true,

                  plugins: {

                    legend: {

                      position: 'top',

                    },

                    title: {

                      display: true,

                      text: 'カテゴリ別支出'

                    }

                  }

                }

              });

            }

  function generateCategoryColors(categories) {
    const colors = {};
    const colorPalette = [
      'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 159, 64, 0.8)',
      'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)', 'rgba(255, 206, 86, 0.8)',
      'rgba(199, 199, 199, 0.8)', 'rgba(83, 109, 254, 0.8)', 'rgba(46, 125, 50, 0.8)'
    ];
    categories.forEach((c, i) => { colors[c] = colorPalette[i % colorPalette.length]; });
    return colors;
  }

  // ---------- サマリー ----------
  function updateSummary() {
    const totalIncome  = rawFinanceRecords.filter(r => r.type === 'income')
      .reduce((s, d) => s + Number(d.amount || 0), 0);
    const totalExpense = rawFinanceRecords.filter(r => r.type === 'expense')
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const currentMonth = today.slice(0, 7);              // YYYY-MM

    const monthlyExpense = rawFinanceRecords
      .filter(r => r.type === 'expense' && (r.dateKey || "").startsWith(currentMonth))
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    const monthlyIncome = rawFinanceRecords
      .filter(r => r.type === 'income' && (r.dateKey || "").startsWith(currentMonth))
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    const dailyExpense = rawFinanceRecords
      .filter(r => r.type === 'expense' && (r.dateKey || "") === today)
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    const dailyExpenseNoNecessities = rawFinanceRecords
      .filter(r => r.type === 'expense' && (r.dateKey || "") === today && r.category !== '必需品')
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    document.getElementById("current-balance").textContent = `${(totalIncome - totalExpense).toLocaleString()} 円`;
    document.getElementById("monthly-expense").textContent = `${monthlyExpense.toLocaleString()} 円`;
    document.getElementById("monthly-income").textContent  = `${monthlyIncome.toLocaleString()} 円`;
    document.getElementById("daily-expense").textContent   = `${dailyExpense.toLocaleString()} 円`;
    document.getElementById("daily-expense-no-necessities").textContent = `${dailyExpenseNoNecessities.toLocaleString()} 円`;
  }

  updateSummary();

  // ---------- 設定（目標金額） ----------
  const inputGoal = document.getElementById("inputGoal");
  const goalAmountDisplay = document.getElementById("goal-amount");
  const settingsForm = document.getElementById("settingsForm");

  const renderGoalAmount = (amount) => {
    if (typeof amount === "number" && !Number.isNaN(amount)) {
      goalAmountDisplay.textContent = `${amount.toLocaleString()} 円`;
      if (inputGoal) inputGoal.value = amount;
    } else {
      goalAmountDisplay.textContent = `-- 円`;
      if (inputGoal) inputGoal.value = "";
    }
  };

  async function fetchGoalAmount() {
    try {
      const res = await fetch("/api/finance/goal");
      if (!res.ok) throw new Error("failed to fetch goal");
      const data = await res.json();
      const amount = data.goal_amount;
      if (amount === undefined || amount === null) {
        renderGoalAmount(null);
      } else {
        renderGoalAmount(Number(amount));
      }
    } catch (err) {
      console.warn("[finance] goal fetch failed", err);
    }
  }

  async function saveGoalAmount(goalNum) {
    const payload = {
      goal_amount: goalNum,
      year_month: new Date().toISOString().slice(0, 7),
    };
    const res = await fetch("/api/finance/goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let errMsg = "failed to save goal";
      try {
        const errData = await res.json();
        errMsg = errData.error || errMsg;
      } catch (_) {
        // ignore
      }
      throw new Error(errMsg);
    }
    return res.json();
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const goalNum = Number(inputGoal.value);
      if (Number.isNaN(goalNum) || goalNum < 0) {
        alert("有効な目標金額を入力してください。");
        return;
      }
      try {
        const result = await saveGoalAmount(goalNum);
        renderGoalAmount(Number(result.goal_amount));
        alert("目標金額を保存しました。");
      } catch (error) {
        console.error(error);
        alert("目標金額の保存に失敗しました。");
      }
    });
  }

  // ---------- イベント ----------
  searchInput.addEventListener("input", applyFiltersAndSort);
  sortSelect.addEventListener("change", applyFiltersAndSort);
  filterCategory.addEventListener("change", applyFiltersAndSort);
  filterType.addEventListener("change", applyFiltersAndSort);
  // ブラウザのピッカー/手入力どちらでも拾う
  startDateInput.addEventListener("input", applyFiltersAndSort);
  endDateInput.addEventListener("input", applyFiltersAndSort);
  deleteModeBtn?.addEventListener("click", () => {
    isDeleteMode = !isDeleteMode;
    applyFiltersAndSort();
  });
  selectAllCheckbox?.addEventListener("change", (e) => {
    document.querySelectorAll(".finance-record-checkbox").forEach((checkbox) => {
      checkbox.checked = e.target.checked;
    });
  });
  executeDeleteBtn?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".finance-record-checkbox:checked")].map((cb) => cb.dataset.id);
    if (ids.length === 0) {
      alert("削除対象を選択してください。");
      return;
    }
    const res = await fetch("/api/finance/bulk-delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    isDeleteMode = false;
    await refreshRecordsFromApi();
    applyFiltersAndSort();
  });
  editCancelBtn?.addEventListener("click", closeFinanceEditOverlay);
  editOverlay?.addEventListener("click", (e) => {
    if (e.target === editOverlay) closeFinanceEditOverlay();
  });
  editSaveBtn?.addEventListener("click", async () => {
    if (!editingRecordId) return;
    const dateValue = buildDateTimeFromInputs();
    const payload = {
      date: dateValue,
      type: editType.value,
      category: editCategory.value.trim(),
      amount: Number(editAmount.value || 0),
      memo: editMemo.value.trim(),
    };
    if (!payload.date || !payload.category || !payload.amount) {
      alert("日時・カテゴリ・金額を入力してください。");
      return;
    }
    const res = await fetch(`/api/finance/${editingRecordId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    closeFinanceEditOverlay();
    await refreshRecordsFromApi();
    applyFiltersAndSort();
  });

  fetchGoalAmount();
  // 初期描画
  applyFiltersAndSort();
});


/* ========= ホイール式 日付ピッカー（モーダル）
   - 1ステップスクロール
   - 端まで中央寄せ（上下パディング）
   - 月/日も選択行を青ハイライト
   - OKで applyFiltersAndSort()
=========================================== */
(() => {
  const financeDataElement = document.getElementById("finance-data");
  const raw = JSON.parse(financeDataElement?.dataset.allRecords || "[]");

  // 年範囲（データから＋現在±5年）
  const currentYear = new Date().getFullYear();
  const yearsFromData = raw.map(r => Number((r.date || "").slice(0,4))).filter(y => !Number.isNaN(y));
  let minDataYear = yearsFromData.length ? Math.min(...yearsFromData) : currentYear;
  let maxDataYear = yearsFromData.length ? Math.max(...yearsFromData) : currentYear;
  const minYear = Math.min(minDataYear, currentYear - 5);
  const maxYear = Math.max(maxDataYear, currentYear + 5);

  const modal = document.getElementById('fdWheel');
  const selY  = document.getElementById('fdWheelYear');
  const selM  = document.getElementById('fdWheelMonth');
  const selD  = document.getElementById('fdWheelDay');
  const btnOK = modal?.querySelector('.fd-wheel-ok');
  const btnNG = modal?.querySelector('.fd-wheel-cancel');
  let targetInput = null;

  if (!selY || !selM || !selD || !modal) return;

  /* ---------- リスト構築 ---------- */
  function fillYears(){
    selY.innerHTML = '';
    for(let y = minYear; y <= maxYear; y++){
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = `${y} 年`;
      selY.appendChild(o);
    }
  }
  function fillMonths(){
    selM.innerHTML = '';
    for(let m=1;m<=12;m++){
      const o = document.createElement('option');
      o.value = String(m).padStart(2,'0');
      o.textContent = `${m} 月`;
      selM.appendChild(o);
    }
  }
  function daysInYM(y, m){ return new Date(y, Number(m), 0).getDate(); }

  /* ---------- メトリクス/中央寄せ/選択表示 ---------- */
  
  // 項目高さをCSSの想定値(36px)に固定
  const ITEM_HEIGHT = 36; 

  function computeItemHeight(sel){
    // 固定値を使用
    return ITEM_HEIGHT; 
  }
  function centerOffset(sel, h){
    // **修正**: HTMLの size="5" を削除しているため、CSSの height: 180px; を基準に5項目と見なす
    const visible = 5; 
    return Math.floor((visible - 1) / 2); // (5 - 1) / 2 = 2 (中央の2項目上)
  }
  function remeasureAndPad(sel){
    sel.style.paddingTop = sel.style.paddingBottom = '0px';
    const h   = computeItemHeight(sel);
    const off = centerOffset(sel, h);
    const pad = off * h; // 2 * 36 = 72px

    sel.style.paddingTop = sel.style.paddingBottom = `${pad}px`;
    
    sel.dataset.itemH = String(h);
    sel.dataset.pad   = String(pad);
    sel.dataset.off   = String(off);
  }
  function markSelected(sel){
    const idx = sel.selectedIndex;
    Array.from(sel.options).forEach((o, i) => {
      if (i === idx) o.setAttribute('data-selected', 'true');
      else o.removeAttribute('data-selected');
    });
  }
    
  // **↓↓↓ 修正関数: setTimeoutで強制スクロール ↓↓↓**
  function centerScrollToIndex(sel, idx){
    const len = sel.options.length;
    idx = Math.max(0, Math.min(len - 1, idx));
    sel.selectedIndex = idx;

    const h   = parseFloat(sel.dataset.itemH) || computeItemHeight(sel);
    const pad = parseFloat(sel.dataset.pad)   || 0;

    const desired = idx * h - pad; 
    const maxTop  = Math.max(0, sel.scrollHeight - sel.clientHeight);
    
    const finalScrollTop = Math.max(0, Math.min(maxTop, desired));

    // setTimeoutで強制的にスクロールを実行
    setTimeout(() => {
      sel.scrollTop = finalScrollTop;
    }, 0); 
    // --------------------------------------------

    markSelected(sel);
  }
  // **↑↑↑ 修正関数 ↑↑↑**

  /* ---------- 日リスト作成（中央寄せまで） ---------- */
  function fillDays(y, m, pickDay='01'){
    selD.innerHTML = '';
    const maxD = daysInYM(Number(y), Number(m));
    for(let d=1; d<=maxD; d++){
      const o = document.createElement('option');
      o.value = String(d).padStart(2,'0');
      o.textContent = `${d} 日`;
      selD.appendChild(o);
    }
    const safeDay = Math.min(Number(pickDay), maxD);
    remeasureAndPad(selD);
    requestAnimationFrame(() => {
      centerScrollToIndex(selD, safeDay - 1);
    });
  }

  /* ---------- ステップスクロール ---------- */
  function step(sel, delta){
    const next = sel.selectedIndex + (delta > 0 ? 1 : -1);
    centerScrollToIndex(sel, next);
    // 年/月を動かしたら日数の再構築に利用
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function attachDiscreteWheel(sel){
    let locked = false;
    const LOCK_MS = 90;
    sel.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (locked) return;
      locked = true;
      const dir = e.deltaY === 0 ? 0 : (e.deltaY > 0 ? 1 : -1);
      if (dir !== 0) step(sel, dir);
      setTimeout(() => { locked = false; }, LOCK_MS);
    }, { passive: false });

    sel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(sel, +1); }
      else if (e.key === 'ArrowUp'  || e.key === 'PageUp') { e.preventDefault(); step(sel, -1); }
      else if (e.key === 'Home')  { e.preventDefault(); centerScrollToIndex(sel, 0); sel.dispatchEvent(new Event('change',{bubbles:true})); }
      else if (e.key === 'End')   { e.preventDefault(); centerScrollToIndex(sel, sel.options.length - 1); sel.dispatchEvent(new Event('change',{bubbles:true})); }
    });

    sel.addEventListener('change', () => centerScrollToIndex(sel, sel.selectedIndex));
  }

  /* ---------- 初期構築 (最終調整済み) ---------- */
  fillYears();
  fillMonths();
  
  const [ty, tm, td] = new Date().toISOString().slice(0,10).split('-');
  
  selY.value = ty;
  selM.value = tm;
  
  fillDays(ty, tm, td);
  
  [selY, selM].forEach(sel => { 
    remeasureAndPad(sel); 
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerScrollToIndex(sel, sel.selectedIndex); 
      });
    });
  });
  
  [selY, selM, selD].forEach(attachDiscreteWheel);
  // ------------------------------------

  /* ---------- 開閉 (最終調整済み) ---------- */
  function openWheel(forInput){
    targetInput = document.getElementById(forInput);
    const base = (targetInput?.value && /^\d{4}-\d{2}-\d{2}$/.test(targetInput.value))
      ? targetInput.value
      : new Date().toISOString().slice(0,10);

    const [y,m,d] = base.split('-');
    const yy = Math.max(minYear, Math.min(maxYear, Number(y)));

    selY.value = String(yy);
    selM.value = m;
    fillDays(yy, m, d);

    [selY, selM, selD].forEach(remeasureAndPad);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerScrollToIndex(selY, selY.selectedIndex);
        centerScrollToIndex(selM, selM.selectedIndex);
        centerScrollToIndex(selD, selD.selectedIndex);
      });
    });

    modal.hidden = false;
    selY.focus();
  }
  function closeWheel(){
    modal.hidden = true;
    targetInput = null;
  }

  /* ---------- 依存（年/月変更→日数再構築） ---------- */
  selY.addEventListener('change', () => fillDays(selY.value, selM.value, selD.value));
  selM.addEventListener('change', () => fillDays(selY.value, selM.value, selD.value));

  /* ---------- OK/Cancel/外側クリック/Esc ---------- */
  btnOK?.addEventListener('click', () => {
    if(!targetInput) return closeWheel();
    centerScrollToIndex(selY, selY.selectedIndex);
    centerScrollToIndex(selM, selM.selectedIndex);
    centerScrollToIndex(selD, selD.selectedIndex);

    const y = selY.value;
    const m = selM.value.padStart(2,'0');
    const d = selD.value.padStart(2,'0');
    targetInput.value = `${y}-${m}-${d}`;

    if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
    closeWheel();
  });
  btnNG?.addEventListener('click', closeWheel);
  modal?.addEventListener('click', (e) => { if(e.target === modal) closeWheel(); });
  window.addEventListener('keydown', (e) => { if(!modal.hidden && e.key === 'Escape') closeWheel(); });

  /* ---------- 起動ボタン（🗓） ---------- */
  document.querySelectorAll('.fd-wheel-btn').forEach(btn=>{
    btn.addEventListener('click', () => openWheel(btn.dataset.target));
  });
})();
