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
  const m = String(s).trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return "";
  const y = m[1];
  const mo = String(m[2]).padStart(2, "0");
  const d = String(m[3]).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("finance-data");

  // ---------- データ取得 ----------
  const rawFinanceRecords = JSON.parse(container?.dataset.allRecords || "[]");

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

  let incomeChart = null;
  let expenseChart = null;

  // ---------- カテゴリオプション構築 ----------
  const allCategories = [...new Set(rawFinanceRecords.map(r => r.category))].filter(Boolean);
  // 既存の "all" 以外をクリア
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

      // 表示は record.date があればそのまま、無ければ dateKey を / 表示
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

    const monthlyData = records.reduce((acc, r) => {
      const m = (r.dateKey || "").substring(0, 7); // YYYY-MM
      if (!m) return acc;
      acc[m] = (acc[m] || 0) + Number(r.amount || 0);
      return acc;
    }, {});
    const labels = Object.keys(monthlyData).sort();
    const data = labels.map(l => monthlyData[l]);

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
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function drawExpenseChart(records) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (expenseChart) expenseChart.destroy();

    const categories = [...new Set(records.map(r => r.category))];
    const categoryColorMap = generateCategoryColors(categories);

    const monthlyData = records.reduce((acc, r) => {
      const m = (r.dateKey || "").substring(0, 7);
      if (!m) return acc;
      if (!acc[m]) acc[m] = {};
      const cat = r.category || "未分類";
      acc[m][cat] = (acc[m][cat] || 0) + Number(r.amount || 0);
      return acc;
    }, {});
    const labels = Object.keys(monthlyData).sort();

    const datasets = categories.map(category => ({
      label: category,
      data: labels.map(l => monthlyData[l][category] || 0),
      backgroundColor: categoryColorMap[category]
    }));

    expenseChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
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

  const savedGoal = localStorage.getItem("financeGoalAmount");
  if (savedGoal) {
    goalAmountDisplay.textContent = `${Number(savedGoal).toLocaleString()} 円`;
    inputGoal.value = savedGoal;
  } else {
    goalAmountDisplay.textContent = `-- 円`;
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const goalNum = Number(inputGoal.value);
      if (!isNaN(goalNum) && goalNum >= 0) {
        localStorage.setItem("financeGoalAmount", goalNum);
        goalAmountDisplay.textContent = `${goalNum.toLocaleString()} 円`;
        alert("目標金額を保存しました。");
      } else {
        alert("有効な目標金額を入力してください。");
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