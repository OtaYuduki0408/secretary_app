/* =========================
   finance.js — 完全版 (SyncBridge対応)
========================= */

// グローバル公開（ホイール側から呼ぶ）
let applyFiltersAndSort;

/* 日付を YYYY-MM-DD に正規化 */
function normalizeDateToKey(s) {
  if (!s) return "";
  const m = String(s).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return "";
  const y = m[1];
  const mo = String(m[2]).padStart(2, "0");
  const d = String(m[3]).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

document.addEventListener("DOMContentLoaded", async () => {

  const useAndroidSync = window.AndroidSync && typeof window.AndroidSync.request === 'function';

  // APIリクエストのラッパー関数
  async function apiRequest(method, url, body = null) {
    if (useAndroidSync) {
        return new Promise((resolve, reject) => {
            try {
                const resultJson = window.AndroidSync.request(method, url, body ? JSON.stringify(body) : null);
                const result = JSON.parse(resultJson);
                if (result.status >= 200 && result.status < 300) {
                    resolve(result.body);
                } else {
                    reject({ error: result.body.error || `HTTP ${result.status}` });
                }
            } catch (e) {
                reject(e);
            }
        });
    } else {
        const options = { method, headers: { "Content-Type": "application/json" } };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(url, options);
        const data = await res.json();
        if (!res.ok) throw { error: data.error || `HTTP ${res.status}` };
        return data;
    }
  }

  // ---------- データ取得 ----------
  let rawFinanceRecords = [];
  try {
      rawFinanceRecords = await apiRequest("GET", "/api/finance");
      rawFinanceRecords.forEach(r => {
        r.dateKey = normalizeDateToKey(r.date || "");
      });
  } catch(e) {
      console.error("Failed to load initial finance records", e);
      financeTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 10px;">データの読み込みに失敗しました。</td></tr>';
  }

  // ---------- 要素 ----------
  const financeTableBody = document.querySelector("#financeTable tbody");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const filterCategory = document.getElementById("filterCategory");
  const filterType = document.getElementById("filterType");
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");

  let incomeChart = null;
  let expenseChart = null;

  // ---------- カテゴリオプション構築 ----------
  const allCategories = [...new Set(rawFinanceRecords.map(r => r.category))].filter(Boolean);
  filterCategory.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
  allCategories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    filterCategory.appendChild(option);
  });

  // ---------- テーブル描画 ----------
  function renderTable(data) {
    financeTableBody.innerHTML = "";
    if (data.length === 0) {
      financeTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 10px;">該当するデータがありません。</td></tr>';
      return;
    }
    data.forEach(record => {
      const row = financeTableBody.insertRow();
      row.classList.add(`type-${record.type}`);
      const displayDate = record.date || (record.dateKey ? record.dateKey.replaceAll("-", "/") : "");
      row.insertCell().textContent = displayDate;
      const typeCell = row.insertCell();
      typeCell.textContent = record.type === 'income' ? '収入' : '支出';
      typeCell.classList.add('fd-type-cell');
      typeCell.style.color = record.type === 'income' ? '#00bcd4' : '#e74c3c';
      row.insertCell().textContent = record.category ?? "";
      row.insertCell().textContent = record.description ?? "";
      const amountCell = row.insertCell();
      amountCell.textContent = `${Number(record.amount || 0).toLocaleString()} 円`;
      amountCell.classList.add('fd-amount-cell');
    });
  }

  // ---------- フィルタ & ソート ----------
  applyFiltersAndSort = function () {
    let currentData = [...rawFinanceRecords];
    const selectedType = document.querySelector('input[name="typeFilter"]:checked')?.value || "all";
    if (selectedType !== "all") {
      currentData = currentData.filter(r => r.type === selectedType);
    }
    const selectedOptions = Array.from(filterCategory.selectedOptions).map(o => o.value);
    if (!selectedOptions.includes("all") && selectedOptions.length > 0) {
      currentData = currentData.filter(r => selectedOptions.includes(r.category));
    }
    const searchTerm = (searchInput.value || "").toLowerCase();
    if (searchTerm) {
      currentData = currentData.filter(r =>
        (r.description || "").toLowerCase().includes(searchTerm) ||
        (r.date || "").includes(searchTerm)
      );
    }
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    if (startDate) currentData = currentData.filter(r => (r.dateKey || "") >= startDate);
    if (endDate)   currentData = currentData.filter(r => (r.dateKey || "") <= endDate);
    const sortKey = sortSelect.value;
    currentData.sort((a, b) => {
      if (sortKey === "date") {
        return new Date(b.dateKey || 0) - new Date(a.dateKey || 0);
      } else if (sortKey === "amount") {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      return 0;
    });
    renderTable(currentData);
    updateCharts(currentData);
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
      data: { labels, datasets: [{ label: '収入', data, backgroundColor: 'rgba(0, 188, 212, 0.8)', borderColor: 'rgba(0, 188, 212, 1)', borderWidth: 1 }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false }, title: { display: true, text: 'カテゴリ別収入' } } }
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
      data: { labels: labels, datasets: [{ data: data, backgroundColor: Object.values(backgroundColors) }] },
      options: { responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'カテゴリ別支出' } } }
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
  async function updateSummary() {
    try {
        const data = await apiRequest("GET", "/api/finance/summary");
        document.getElementById("current-balance").textContent = `${Number(data.balance || 0).toLocaleString()} 円`;
        document.getElementById("monthly-expense").textContent = `${Number(data.monthly_expense || 0).toLocaleString()} 円`;
        document.getElementById("monthly-income").textContent  = `${Number(data.monthly_income || 0).toLocaleString()} 円`;
        document.getElementById("daily-expense").textContent   = `${Number(data.daily_expense || 0).toLocaleString()} 円`;
        document.getElementById("daily-expense-no-necessities").textContent = `${Number(data.daily_expense_no_necessities || 0).toLocaleString()} 円`;
    } catch(e) {
        console.error("Failed to update summary", e);
    }
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
      const data = await apiRequest("GET", "/api/finance/goal");
      const amount = data.goal_amount;
      renderGoalAmount(amount === undefined || amount === null ? null : Number(amount));
    } catch (err) {
      console.warn("[finance] goal fetch failed", err);
    }
  }

  async function saveGoalAmount(goalNum) {
    const payload = {
      goal_amount: goalNum,
      year_month: new Date().toISOString().slice(0, 7),
    };
    return await apiRequest("POST", "/api/finance/goal", payload);
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
  startDateInput.addEventListener("input", applyFiltersAndSort);
  endDateInput.addEventListener("input", applyFiltersAndSort);

  fetchGoalAmount();
  applyFiltersAndSort();
});

// ... (ホイール式 日付ピッカーのコードは変更なしなので省略) ...
(() => {
  const financeDataElement = document.getElementById("finance-data");
  // This part is now unused as data is fetched via API, but keep for wheel picker logic
  const raw = []; 

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

  function fillYears(){
    selY.innerHTML = '';
    for(let y = minYear; y <= maxYear; y++){
      const o = document.createElement('option'); o.value = String(y); o.textContent = `${y} 年`; selY.appendChild(o);
    }
  }
  function fillMonths(){
    selM.innerHTML = '';
    for(let m=1;m<=12;m++){
      const o = document.createElement('option'); o.value = String(m).padStart(2,'0'); o.textContent = `${m} 月`; selM.appendChild(o);
    }
  }
  function daysInYM(y, m){ return new Date(y, Number(m), 0).getDate(); }
  const ITEM_HEIGHT = 36; 
  function centerOffset(sel, h){ return Math.floor(5 / 2); }
  function remeasureAndPad(sel){
    sel.style.paddingTop = sel.style.paddingBottom = '0px';
    const h = ITEM_HEIGHT; const off = centerOffset(sel, h); const pad = off * h;
    sel.style.paddingTop = sel.style.paddingBottom = `${pad}px`;
    sel.dataset.itemH = String(h); sel.dataset.pad = String(pad); sel.dataset.off = String(off);
  }
  function markSelected(sel){
    const idx = sel.selectedIndex;
    Array.from(sel.options).forEach((o, i) => { o.toggleAttribute('data-selected', i === idx); });
  }
  function centerScrollToIndex(sel, idx){
    sel.selectedIndex = Math.max(0, Math.min(sel.options.length - 1, idx));
    const h = parseFloat(sel.dataset.itemH) || ITEM_HEIGHT;
    const pad = parseFloat(sel.dataset.pad) || 0;
    const desired = sel.selectedIndex * h - pad;
    const finalScrollTop = Math.max(0, Math.min(sel.scrollHeight - sel.clientHeight, desired));
    setTimeout(() => { sel.scrollTop = finalScrollTop; }, 0);
    markSelected(sel);
  }
  function fillDays(y, m, pickDay='01'){
    selD.innerHTML = '';
    const maxD = daysInYM(Number(y), Number(m));
    for(let d=1; d<=maxD; d++){
      const o = document.createElement('option'); o.value = String(d).padStart(2,'0'); o.textContent = `${d} 日`; selD.appendChild(o);
    }
    remeasureAndPad(selD);
    requestAnimationFrame(() => { centerScrollToIndex(selD, Math.min(Number(pickDay), maxD) - 1); });
  }
  function step(sel, delta){
    centerScrollToIndex(sel, sel.selectedIndex + (delta > 0 ? 1 : -1));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function attachDiscreteWheel(sel){
    let locked = false; const LOCK_MS = 90;
    sel.addEventListener('wheel', (e) => {
      e.preventDefault(); if (locked) return; locked = true;
      const dir = e.deltaY === 0 ? 0 : (e.deltaY > 0 ? 1 : -1);
      if (dir !== 0) step(sel, dir);
      setTimeout(() => { locked = false; }, LOCK_MS);
    }, { passive: false });
    sel.addEventListener('keydown', (e) => {
      if (['ArrowDown','PageDown'].includes(e.key)) { e.preventDefault(); step(sel, +1); }
      else if (['ArrowUp','PageUp'].includes(e.key)) { e.preventDefault(); step(sel, -1); }
      else if (e.key === 'Home') { e.preventDefault(); centerScrollToIndex(sel, 0); sel.dispatchEvent(new Event('change',{bubbles:true})); }
      else if (e.key === 'End') { e.preventDefault(); centerScrollToIndex(sel, sel.options.length - 1); sel.dispatchEvent(new Event('change',{bubbles:true})); }
    });
    sel.addEventListener('change', () => centerScrollToIndex(sel, sel.selectedIndex));
  }
  function openWheel(forInput){
    targetInput = document.getElementById(forInput);
    const base = (targetInput?.value && /^\d{4}-\d{2}-\d{2}$/.test(targetInput.value)) ? targetInput.value : new Date().toISOString().slice(0,10);
    const [y,m,d] = base.split('-');
    selY.value = String(Math.max(minYear, Math.min(maxYear, Number(y))));
    selM.value = m; fillDays(selY.value, m, d);
    [selY, selM, selD].forEach(remeasureAndPad);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { [selY, selM, selD].forEach(s => centerScrollToIndex(s, s.selectedIndex)); });
    });
    modal.hidden = false; selY.focus();
  }
  function closeWheel(){ modal.hidden = true; targetInput = null; }
  selY.addEventListener('change', () => fillDays(selY.value, selM.value, selD.value));
  selM.addEventListener('change', () => fillDays(selY.value, selM.value, selD.value));
  btnOK?.addEventListener('click', () => {
    if(!targetInput) return closeWheel();
    [selY, selM, selD].forEach(s => centerScrollToIndex(s, s.selectedIndex));
    targetInput.value = `${selY.value}-${selM.value.padStart(2,'0')}-${selD.value.padStart(2,'0')}`;
    if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
    closeWheel();
  });
  btnNG?.addEventListener('click', closeWheel);
  modal?.addEventListener('click', (e) => { if(e.target === modal) closeWheel(); });
  window.addEventListener('keydown', (e) => { if(!modal.hidden && e.key === 'Escape') closeWheel(); });
  document.querySelectorAll('.fd-wheel-btn').forEach(btn => {
    btn.addEventListener('click', () => openWheel(btn.dataset.target));
  });

  // Initial setup call
  fillYears();
  fillMonths();
  const [ty, tm, td] = new Date().toISOString().slice(0,10).split('-');
  selY.value = ty; selM.value = tm; fillDays(ty, tm, td);
  [selY, selM, selD].forEach(s => {
    remeasureAndPad(s);
    requestAnimationFrame(()=>requestAnimationFrame(()=>centerScrollToIndex(s, s.selectedIndex)));
  });
})();
